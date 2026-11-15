import { t } from "@/lib/i18n";
import { replySnippet } from "@/lib/replies";
import type { Group, GroupTask } from "@/state/store";
import type { RoomQueueEntry } from "../../shared/wire";
import type { RoomTodo } from "../../shared/room-todo";

type RoomThreads = Pick<Group, "threadId" | "working" | "busyBotId" | "tasks"> & Partial<Pick<Group, "queue">>;
type RoomThread = Pick<GroupTask, "threadId" | "working" | "busyBotId">;

/** Goal titles are user-facing: attachment markup (including old truncated titles) must not expose local paths. */
export function roomGoalTitle(text: string): string {
  return replySnippet(text.replace(/<attached-(image|file)\b[^>]*(?:>|$)/gi, (_tag, kind: string) =>
    t(kind.toLowerCase() === "image" ? "chat.reply.image" : "chat.reply.file")), 500);
}

function reportsPerThread(task: RoomThread | undefined): task is RoomThread {
  return Boolean(task) && (typeof task!.working === "boolean" || task!.busyBotId !== undefined);
}

function taskOf(group: RoomThreads, threadId: string): RoomThread | undefined {
  return group.tasks?.find((task) => task.threadId === threadId);
}

export function roomThreadWorking(group: RoomThreads, threadId: string): boolean {
  if (group.queue !== undefined) return group.queue.some((entry) => entry.threadId === threadId && entry.state === "running");
  const task = taskOf(group, threadId);
  if (reportsPerThread(task)) return Boolean(task.working || task.busyBotId);
  return threadId === group.threadId && Boolean(group.working || group.busyBotId);
}

export function roomThreadSpeakerId(group: RoomThreads, threadId: string): string | null {
  if (group.queue !== undefined) return group.queue.find((entry) => entry.threadId === threadId && entry.state === "running")?.botId ?? null;
  const task = taskOf(group, threadId);
  if (reportsPerThread(task)) return task.busyBotId ?? null;
  return threadId === group.threadId ? group.busyBotId ?? null : null;
}

export function roomThreadSpeakerIds(group: RoomThreads, threadId: string): string[] {
  if (group.queue !== undefined) return [...new Set(group.queue.filter((entry) => entry.threadId === threadId && entry.state === "running").map((entry) => entry.botId))];
  const fallback = roomThreadSpeakerId(group, threadId);
  return fallback ? [fallback] : [];
}

export function roomActiveMembersLabel(group: Group, ids: string[]): string {
  const stopping = ids.filter((id) => Boolean(group.holds?.[id])).length;
  const working = ids.length - stopping;
  return [working ? t("roomTodo.parallel", { count: working }) : "", stopping ? t("roomTodo.stoppingCount", { count: stopping }) : ""].filter(Boolean).join(" · ");
}

export function roomSpeakerIds(group: RoomThreads): string[] {
  if (group.queue !== undefined) return [...new Set(group.queue.filter((entry) => entry.state === "running").map((entry) => entry.botId))];
  const ids = [group.busyBotId, ...(group.tasks ?? []).map((task) => task.busyBotId)]
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)];
}

export function roomThreadsWorkingElsewhere(group: RoomThreads): number {
  return (group.tasks ?? []).filter((task) => task.threadId !== group.threadId && roomThreadWorking(group, task.threadId)).length;
}

export function roomThreadQueue(group: Pick<Group, "queue">, threadId: string): RoomQueueEntry[] {
  return (group.queue ?? []).filter((entry) => entry.threadId === threadId && entry.state === "queued" && !group.queue?.some((running) =>
    running.state === "running" && sameRoomExecution(running, entry)));
}

export function sameRoomExecution(a: RoomQueueEntry, b: RoomQueueEntry): boolean {
  if (a.botId !== b.botId || a.threadId !== b.threadId) return false;
  if (a.assignmentId && b.assignmentId && a.assignmentId !== b.assignmentId) return false;
  if (a.executionId && b.executionId) return a.executionId === b.executionId;
  return Boolean(a.assignmentId && a.assignmentId === b.assignmentId);
}

export function roomExecutionTodo(group: RoomThreads, entry: RoomQueueEntry): RoomTodo | undefined {
  if (!entry.todoId || entry.threadId !== group.threadId) return undefined;
  const matches = group.tasks?.find((task) => task.threadId === entry.threadId)?.todos?.filter((todo) =>
    todo.id === entry.todoId && todo.assigneeId === entry.botId &&
    (!todo.assignmentId || todo.assignmentId === entry.assignmentId) && (todo.status === "working" || todo.status === "returned")) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

export function roomTodoExecution(group: RoomThreads, todo: RoomTodo): RoomQueueEntry | undefined {
  const matches = group.queue?.filter((entry) => entry.threadId === group.threadId && roomExecutionTodo(group, entry) === todo) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

export function roomQueueLabel(entry: RoomQueueEntry, nameOf: (botId: string) => string | undefined): string {
  if (entry.state === "running") return t("room.queue.running");
  if (entry.waitReason === "member_busy") return t("room.queue.memberBusy", { position: entry.position, of: entry.of });
  if (entry.waitReason === "dispatch") return t("room.queue.dispatch", { position: entry.position, of: entry.of });
  const name = entry.waitReason === "room_turn" && entry.waitingForBotId && entry.waitingForBotId !== entry.botId ? nameOf(entry.waitingForBotId) : undefined;
  if (entry.waitReason === "room_turn" && !name) return t("room.queue.roomTurn", { position: entry.position, of: entry.of });
  return name
    ? t("room.queue.waitingFor", { name, position: entry.position, of: entry.of })
    : t("room.queue.waiting", { position: entry.position, of: entry.of });
}

export function roomQueuedWorkLabel(group: RoomThreads, entry: RoomQueueEntry, nameOf: (botId: string) => string | undefined): string {
  let status = roomQueueLabel(entry, nameOf);
  if (entry.state === "queued" && (entry.waitReason === "member_busy" || entry.waitReason === "room_turn")) {
    if (entry.waitingForThreadId && entry.waitingForThreadId !== entry.threadId) {
      const title = group.tasks?.find((task) => task.threadId === entry.waitingForThreadId)?.title;
      status = t("room.queue.otherThread", { status, title: title ?? t("room.queue.otherConversation") });
    } else if (entry.waitingForExecutionId) {
      const blocker = group.queue?.find((candidate) => candidate.state === "running" && candidate.threadId === entry.threadId && candidate.executionId === entry.waitingForExecutionId &&
        (entry.waitReason === "member_busy" ? candidate.botId === entry.botId : !entry.waitingForBotId || candidate.botId === entry.waitingForBotId));
      const todo = blocker && roomExecutionTodo(group, blocker);
      if (todo) status = t("room.queue.blockingTask", { status, title: todo.title });
    }
  }
  if (!roomThreadSpeakerIds(group, entry.threadId).includes(entry.botId)) return status;
  const running = group.queue?.filter((candidate) => candidate.state === "running" && candidate.threadId === entry.threadId && candidate.botId === entry.botId) ?? [];
  const separate = running.length > 0 && running.every((candidate) =>
    Boolean(entry.executionId && candidate.executionId && entry.executionId !== candidate.executionId) ||
    Boolean(entry.assignmentId && candidate.assignmentId && entry.assignmentId !== candidate.assignmentId));
  return t(separate ? "room.queue.additional" : "room.queue.pendingEntry", { status });
}

export function roomWorkingPreview(group: RoomThreads & Pick<Group, "queue">, nameOf: (botId: string) => string | undefined): string | undefined {
  const speakerId = roomSpeakerIds(group)[0];
  const queued = [...new Set((group.queue ?? []).map((entry) => entry.threadId))].flatMap((threadId) => roomThreadQueue(group, threadId));
  if (speakerId) {
    const name = nameOf(speakerId) ?? t("sidebar.preview.aBot");
    return queued.length ? t("sidebar.preview.botWorkingQueued", { name, count: queued.length }) : t("sidebar.preview.botWorking", { name });
  }
  if (queued[0]) return t("room.queue.member", { name: nameOf(queued[0].botId) ?? t("sidebar.preview.aBot"), status: roomQueueLabel(queued[0], nameOf) });
  return undefined;
}
