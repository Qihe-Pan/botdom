import { randomUUID } from "node:crypto";
import type { RoomExecutionIdentity, RoomLineItem } from "./room-queue.ts";
import type { RuntimeEvent } from "../shared/runtime-events.ts";

export function roomRuntimeEvent(event: RuntimeEvent, threadId: string, speaker?: { botId: string } & RoomExecutionIdentity): RuntimeEvent {
  if (!speaker && event.threadId === threadId) return event;
  return { ...event, threadId, ...(event.threadId !== threadId ? { executionThreadId: event.threadId } : {}),
    botId: speaker?.botId, executionId: speaker?.executionId, assignmentId: speaker?.assignmentId, todoId: speaker?.todoId };
}

export interface RoomTurnIdentities {
  executions: Map<string, RoomExecutionIdentity>;
}

export function roomTurnIdentity(operation: RoomTurnIdentities, botId: string): RoomExecutionIdentity {
  let identity = operation.executions.get(botId);
  if (!identity) {
    identity = { executionId: randomUUID() };
    operation.executions.set(botId, identity);
  }
  return identity;
}

export function releaseRoomTurnIdentity(operation: RoomTurnIdentities, botId: string, identity: RoomExecutionIdentity): void {
  if (operation.executions.get(botId) === identity) operation.executions.delete(botId);
}

export interface RoomEmployeeExecution {
  groupId: string;
  threadId: string;
  botId: string;
  identity: RoomExecutionIdentity;
  operation: { cancelled: boolean };
  started: boolean;
}

export function roomRuntimeQueue(args: {
  groupId: string;
  speakers: ReadonlyMap<string, { botId: string } & RoomExecutionIdentity>;
  employees: ReadonlyMap<string, RoomEmployeeExecution>;
  groupOf(threadId: string): string | undefined;
  conversationOf(threadId: string): string;
  memberBusy(botId: string): boolean;
}): RoomLineItem[] {
  const running: RoomLineItem[] = [...args.speakers].flatMap(([id, speaker]) => args.groupOf(id) === args.groupId
    ? [{ botId: speaker.botId, threadId: args.conversationOf(id), state: "running" as const,
      ...(speaker.executionId ? { executionId: speaker.executionId } : {}),
      ...(speaker.assignmentId ? { assignmentId: speaker.assignmentId } : {}),
      ...(speaker.todoId ? { todoId: speaker.todoId } : {}) }]
    : []);
  const queued: RoomLineItem[] = [...args.employees].flatMap(([id, item]) => item.groupId === args.groupId && !item.operation.cancelled && !item.started && !args.speakers.has(id)
    ? [{ botId: item.botId, threadId: item.threadId, state: "queued" as const, ...item.identity,
      waitReason: args.memberBusy(item.botId) ? "member_busy" as const : "dispatch" as const }]
    : []);
  return [...running, ...queued];
}
