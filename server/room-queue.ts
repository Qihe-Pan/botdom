import type { RoomQueueEntry } from "../shared/wire.ts";

export type RoomExecutionIdentity = Pick<RoomQueueEntry, "executionId" | "assignmentId" | "todoId">;

export interface RoomLineItem extends RoomExecutionIdentity {
  botId: string;
  threadId: string;
  state: "running" | "queued";
  waitReason?: RoomQueueEntry["waitReason"];
  waitingForBotId?: string;
  waitingForThreadId?: string;
  waitingForExecutionId?: string;
}

export function sameRoomExecution(a: RoomLineItem, b: RoomLineItem): boolean {
  if (a.botId !== b.botId || a.threadId !== b.threadId) return false;
  if (a.assignmentId && b.assignmentId && a.assignmentId !== b.assignmentId) return false;
  if (a.executionId && b.executionId) return a.executionId === b.executionId;
  return Boolean(a.assignmentId && a.assignmentId === b.assignmentId);
}

export function roomQueue(items: readonly RoomLineItem[]): RoomQueueEntry[] {
  const lines = new Map<string, RoomLineItem[]>();
  for (const item of items) {
    const line = lines.get(item.threadId) ?? [];
    const matches = line.flatMap((other, index) => sameRoomExecution(other, item) ? [index] : []);
    const index = matches.length === 1 ? matches[0]! : -1;
    const placed = line[index];
    if (!placed) line.push(item);
    else {
      const winner = item.state === "running" || placed.state !== "running" ? item : placed;
      const other = winner === item ? placed : item;
      line[index] = { ...other, ...winner,
        ...(winner.executionId || other.executionId ? { executionId: winner.executionId ?? other.executionId } : {}),
        ...(winner.assignmentId || other.assignmentId ? { assignmentId: winner.assignmentId ?? other.assignmentId } : {}),
        ...(winner.todoId && other.todoId && winner.todoId !== other.todoId ? { todoId: undefined } : { todoId: winner.todoId ?? other.todoId }),
      };
    }
    lines.set(item.threadId, line);
  }
  const entries: RoomQueueEntry[] = [];
  for (const [threadId, raw] of lines) {
    const line = [...raw.filter(item => item.state === "running"), ...raw.filter(item => item.state === "queued")];
    line.forEach((item, index) => {
      const waitingFor = item.state === "queued" && item.waitingForBotId !== item.botId ? item.waitingForBotId : undefined;
      entries.push({
        botId: item.botId, threadId, state: item.state, position: index + 1, of: line.length,
        ...(waitingFor ? { waitingForBotId: waitingFor } : {}),
        ...(item.state === "queued" && item.waitReason ? { waitReason: item.waitReason } : {}),
        ...(item.state === "queued" && item.waitingForThreadId ? { waitingForThreadId: item.waitingForThreadId } : {}),
        ...(item.state === "queued" && item.waitingForExecutionId ? { waitingForExecutionId: item.waitingForExecutionId } : {}),
        ...(item.assignmentId ? { assignmentId: item.assignmentId } : {}),
        ...(item.executionId ? { executionId: item.executionId } : {}),
        ...(item.todoId ? { todoId: item.todoId } : {}),
      });
    });
  }
  return entries;
}

export function queuedJobDetail(entry: RoomQueueEntry, nameOf: (botId: string) => string): string {
  const after = entry.waitingForBotId ? `, after ${nameOf(entry.waitingForBotId)}` : "";
  return `queued ${entry.position} of ${entry.of} in this room${after}; ${entry.waitReason === "member_busy" ? "this employee already has an active turn" : entry.waitReason === "room_turn" ? "waiting for the current room turn to finish" : "awaiting dispatch"}`;
}

export function sequentialRoomNotice(line: readonly RoomQueueEntry[], sent: ReadonlySet<string>, nameOf: (botId: string) => string): string | undefined {
  const waiting = line.filter(entry => entry.state === "queued" && entry.waitReason === "room_turn" && entry.assignmentId !== undefined && sent.has(entry.assignmentId));
  if (!waiting.length) return undefined;
  const order = waiting.map(entry => `${nameOf(entry.botId)} (${queuedJobDetail(entry, nameOf)})`).join(", ");
  return `These assignments wait for the current room turn: ${order}. Other employees can run independently. Report only assignments with running state as under way.`;
}
