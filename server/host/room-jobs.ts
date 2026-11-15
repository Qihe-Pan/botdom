import type { AppConfig } from "../config.ts";
import type { Coordinator, HandoffView } from "../coordinator.ts";
import { peerDeliveryReceipt, type PeerDeliveryReceipt } from "../peer-delivery.ts";
import { peerName } from "../peer-roster.ts";
import { queuedJobDetail, roomQueue, sameRoomExecution, sequentialRoomNotice, type RoomExecutionIdentity, type RoomLineItem } from "../room-queue.ts";
import type { GroupRecord, Store } from "../store.ts";
import type { RoomQueueEntry } from "../../shared/wire.ts";

export interface RoomRoundLine { current?: string; pending: string[] }

export interface RoomJobsDeps {
  store: Store;
  // Read lazily: index.ts builds the coordinator after this module.
  coordinator: Pick<Coordinator, "all">;
  cfg: AppConfig;
  operations: (groupId: string) => Iterable<{ threadId: string; cancelled: boolean; line?: RoomRoundLine; startedBotIds?: ReadonlySet<string>; executions?: ReadonlyMap<string, RoomExecutionIdentity> }>;
  speakerOf: (threadId: string) => string | undefined;
  runtime: (groupId: string) => RoomLineItem[];
  memberBusy: (botId: string) => boolean;
  memberRunning?: (botId: string) => { threadId: string; executionId?: string } | undefined;
  hasStarted: (assignmentId: string, botId: string) => boolean;
  laneRoomThread: (n: Pick<HandoffView, "botId" | "threadId" | "groupId">) => string | undefined;
}

export function parallelRoomJobsEnabled(cfg: AppConfig): boolean {
  return cfg.features?.parallelRoomJobs === true;
}

const live = (n: HandoffView) => n.parentId !== undefined && (n.status === "queued" || n.status === "running");

export function independentRoomAssignment(
  group: Pick<GroupRecord, "id" | "supervisorId">,
  node: Pick<HandoffView, "botId" | "groupId" | "threadId" | "mode">,
  parent: Pick<HandoffView, "botId" | "groupId" | "threadId"> | undefined,
  conversationOf: (threadId: string) => string,
): boolean {
  return parent !== undefined && parent.groupId === group.id && node.groupId === group.id &&
    node.botId !== group.supervisorId && conversationOf(parent.threadId) === conversationOf(node.threadId) &&
    (parent.botId === group.supervisorId || node.mode === "notify");
}

export function createRoomJobs({ store, coordinator, cfg, operations, speakerOf, runtime, memberBusy, memberRunning, hasStarted, laneRoomThread }: RoomJobsDeps) {
  function roomLineOf(record: GroupRecord): RoomQueueEntry[] {
    const items: RoomLineItem[] = [];
    const executing = runtime(record.id);
    for (const operation of operations(record.id)) {
      if (operation.cancelled || !operation.line) continue;
      const { current, pending } = operation.line;
      const threadId = store.roomConversation(operation.threadId);
      const currentItem = current ? { botId: current, threadId, state: "queued" as const, ...operation.executions?.get(current) } : undefined;
      const running = currentItem && executing.some(item => item.state === "running" && sameRoomExecution(item, currentItem));
      const blocker = current && (!operation.startedBotIds?.has(current) || running) ? current : undefined;
      if (blocker && currentItem && !running) items.push({ ...currentItem, waitReason: "dispatch" });
      for (const botId of pending) items.push({ botId, threadId, state: "queued",
        ...operation.executions?.get(botId),
        waitReason: blocker ? "room_turn" : "dispatch", ...(blocker ? { waitingForBotId: blocker } : {}) });
    }
    const nodes = coordinator.all();
    const jobs = nodes.filter(n => n.groupId === record.id && live(n)).sort((a, b) => a.createdAt - b.createdAt);
    for (const n of jobs) {
      const threadId = store.roomConversation(n.threadId);
      const assignment = { botId: n.botId, threadId, state: "queued" as const, assignmentId: n.id };
      if (n.status === "running" && hasStarted(n.id, n.botId) && !executing.some(item => sameRoomExecution(item, assignment))) continue;
      const parent = nodes.find(candidate => candidate.id === n.parentId);
      const parallel = independentRoomAssignment(record, n, parent, id => store.roomConversation(id));
      const speaker = speakerOf(n.threadId);
      const blocker = memberRunning?.(n.botId);
      const occupied = memberBusy(n.botId);
      const waitingFor = !occupied && !parallel && speaker !== n.botId ? speaker : undefined;
      items.push({ botId: n.botId, threadId, state: "queued", assignmentId: n.id,
        waitReason: occupied ? "member_busy" : waitingFor ? "room_turn" : "dispatch",
        ...(occupied && blocker ? { waitingForThreadId: blocker.threadId, ...(blocker.executionId ? { waitingForExecutionId: blocker.executionId } : {}) } : {}),
        ...(waitingFor ? { waitingForBotId: waitingFor } : {}) });
    }
    return roomQueue([...items, ...executing]);
  }

  function advanceRound(operation: { line?: RoomRoundLine }, current: string | undefined, spoken: ReadonlySet<string>): boolean {
    if (!operation.line) return false;
    operation.line = { ...(current ? { current } : {}), pending: operation.line.pending.filter(id => id !== current && !spoken.has(id)) };
    return true;
  }

  function useLanes(room: GroupRecord, roomThreadId: string, jobs: number, mode: string): boolean {
    if (mode === "notify" || !parallelRoomJobsEnabled(cfg)) return false;
    return jobs > 1 || coordinator.all().some(n => live(n) && (n.groupId === room.id ? n.threadId === roomThreadId : laneRoomThread(n) === roomThreadId));
  }

  function openLane(room: GroupRecord, roomThreadId: string, botId: string, sender: { id: string; name: string }, brief: string) {
    const existing = store.workThread(botId, sender.id, roomThreadId, true);
    const snippet = brief.replace(/\s+/g, " ").trim().slice(0, 48);
    const task = existing ?? store.createTask(botId, `${room.name} · ${snippet || "room job"}`, false, undefined,
      { botId: sender.id, name: sender.name, threadId: roomThreadId, kind: "work", roomLane: true, at: Date.now() },
      undefined, undefined, store.pinGroupCwd(room.id, roomThreadId) ?? undefined);
    if (!task) throw new Error("The recipient no longer exists");
    return { threadId: task.threadId, title: task.title, created: !existing };
  }

  function describeRoomJobs(room: GroupRecord, roomThreadId: string, receipts: PeerDeliveryReceipt[],
    options: { senderId: string; returns: string; lanes: boolean; awaited: boolean }): string {
    const nameOf = (botId: string) => botId === options.senderId ? "your own turn" : peerName(store.bot(botId)?.name ?? "") || "a teammate";
    const line = roomQueue(roomLineOf(room).filter(entry =>
      entry.threadId === store.roomConversation(roomThreadId) && entry.botId !== options.senderId));
    const supervisorDispatch = room.supervisorId === options.senderId;
    for (const [index, receipt] of receipts.entries()) {
      if (supervisorDispatch) continue;
      const entry = line.find(candidate => candidate.assignmentId === receipt.requestId && candidate.state === "queued");
      if (!entry || receipt.outcome !== "queued") continue;
      receipts[index] = peerDeliveryReceipt({ ...receipt, detail: `${queuedJobDetail(entry, nameOf)}; ${options.returns}`,
        queue: { position: entry.position, of: entry.of, ...(entry.waitingForBotId ? { waitingFor: nameOf(entry.waitingForBotId) } : {}) } });
    }
    const parallel = supervisorDispatch
      ? "These employee assignments are scheduled independently in this room and can run in parallel. A queued receipt has not started; report it as queued. You resume once after all awaited reports settle."
      : options.lanes && options.awaited
      ? "These run in parallel, each in a thread of its own beside this room; each posts its result card here when it finishes, and you resume once with all of them."
      : undefined;
    const sequential = supervisorDispatch ? undefined : sequentialRoomNotice(line, new Set(receipts.flatMap(receipt => receipt.requestId ? [receipt.requestId] : [])), nameOf);
    return [parallel, sequential].filter(Boolean).join(" ");
  }

  return { roomLineOf, advanceRound, useLanes, openLane, describeRoomJobs };
}
