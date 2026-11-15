import type { Group } from "@/state/store";
import type { RoomQueueEntry } from "../../shared/wire";
import type { RoomTodo } from "../../shared/room-todo";
import { roomThreadQueue } from "./room-threads";

export const ROOM_ROUTING_LIMIT = 8;
export const ROOM_ROUTING_BATCH_MS = 100;
export const ROOM_ROUTING_RETURN_MS = 1400;

type RoutingTodo = Pick<RoomTodo, "id" | "title" | "assigneeId" | "status" | "reportMessageId" | "updatedAt" | "assignmentId"> & { reason?: string };
export type RoomRoutingPhase = "queued" | "dispatching" | "running" | "returning" | "reported" | "blocked" | "stopping" | "stopped";
export interface RoomRoutingItem {
  key: string;
  botId: string;
  executionId?: string;
  assignmentId?: string;
  todoId?: string;
  title?: string;
  updatedAt?: number;
  phase: RoomRoutingPhase;
  reportMessageId?: string;
  reason?: string;
  returnUntil?: number;
}
export interface RoomRoutingSnapshot {
  scope: string;
  supervisorId?: string;
  supervisorRunning: boolean;
  heldBotIds: string[];
  entries: RoomQueueEntry[];
  todos: RoutingTodo[];
}
export interface RoomRoutingState {
  scope: string;
  items: RoomRoutingItem[];
  overflow: number;
  supervisorRunning: boolean;
}

export function roomRoutingSnapshot(group: Group): RoomRoutingSnapshot {
  const queue = group.queue ?? [];
  const entries = [...queue.filter((entry) => entry.threadId === group.threadId && entry.state === "running"), ...roomThreadQueue(group, group.threadId)]
    .filter((entry) => entry.botId !== group.supervisorId && group.memberIds.includes(entry.botId));
  return {
    scope: `${group.id}:${group.threadId}`,
    supervisorId: group.supervisorId,
    supervisorRunning: queue.some((entry) => entry.threadId === group.threadId && entry.botId === group.supervisorId && !group.holds?.[entry.botId] && entry.state === "running" && Boolean(entry.executionId || entry.assignmentId)),
    heldBotIds: Object.keys(group.holds ?? {}),
    entries,
    todos: (group.tasks?.find((task) => task.threadId === group.threadId)?.todos ?? []).map((todo) => ({
      id: todo.id, title: todo.title, assigneeId: todo.assigneeId, status: todo.status, reportMessageId: todo.reportMessageId, updatedAt: todo.updatedAt,
      assignmentId: todo.assignmentId,
      ...((todo.status === "blocked" || todo.status === "returned") ? { reason: [...todo.updates].reverse().find((update) => update.text)?.text } : {}),
    })),
  };
}

function matchingTodo(todos: RoutingTodo[], todoId: string | undefined, botId: string, assignmentId?: string): RoutingTodo | undefined {
  const matches = todoId ? todos.filter(todo => todo.id === todoId && todo.assigneeId === botId &&
    (!todo.assignmentId || todo.assignmentId === assignmentId)) : [];
  return matches.length === 1 ? matches[0] : undefined;
}

function terminalPhase(todo: RoutingTodo): RoomRoutingPhase | undefined {
  if (todo.status === "blocked") return "blocked";
  if (todo.status === "todo" || todo.status === "cancelled") return "stopped";
  if (todo.reportMessageId && (todo.status === "reported" || todo.status === "review_ok" || todo.status === "accepted")) return "reported";
  return undefined;
}

function executionPhase(entry: RoomQueueEntry, held: boolean): RoomRoutingPhase {
  if (held) return entry.state === "running" ? "stopping" : "stopped";
  if (entry.state === "running") return "running";
  return entry.waitReason === "dispatch" ? "dispatching" : "queued";
}

export function advanceRoomRouting(previous: RoomRoutingState | undefined, snapshot: RoomRoutingSnapshot, now: number, animateReturns = true): RoomRoutingState {
  const before = previous?.scope === snapshot.scope ? previous.items : [];
  const items: RoomRoutingItem[] = [];
  for (const entry of snapshot.entries) {
    const key = `${entry.botId}:${entry.executionId ? `e:${entry.executionId}` : entry.assignmentId ? `a:${entry.assignmentId}` : `unknown:${entry.position}`}:${entry.assignmentId ?? ""}`;
    if (items.some((item) => item.key === key)) continue;
    const match = matchingTodo(snapshot.todos, entry.todoId, entry.botId, entry.assignmentId);
    const unique = snapshot.entries.filter(candidate => candidate.todoId === entry.todoId && candidate.botId === entry.botId &&
      (!match?.assignmentId || candidate.assignmentId === match.assignmentId)).length === 1;
    const todo = unique ? match : undefined;
    const terminal = todo && terminalPhase(todo);
    const old = before.find((item) => item.key === key);
    const returning = animateReturns && terminal === "reported" && Boolean(entry.executionId || entry.assignmentId) &&
      (old?.phase === "running" || old?.phase === "returning" && (old.returnUntil ?? 0) > now);
    items.push({
      key, botId: entry.botId, executionId: entry.executionId, assignmentId: entry.assignmentId,
      todoId: todo?.id, title: todo?.title, updatedAt: todo?.updatedAt, reportMessageId: todo?.reportMessageId, reason: todo?.reason,
      phase: returning ? "returning" : terminal ?? executionPhase(entry, snapshot.heldBotIds.includes(entry.botId)),
      returnUntil: returning ? old?.returnUntil ?? now + ROOM_ROUTING_RETURN_MS : undefined,
    });
  }
  for (const old of before) {
    if (items.some((item) => item.key === old.key || item.todoId && item.todoId === old.todoId && item.botId === old.botId)) continue;
    const todo = matchingTodo(snapshot.todos, old.todoId, old.botId, old.assignmentId);
    const phase = todo && terminalPhase(todo);
    if (!todo || !phase) continue;
    const returning = animateReturns && phase === "reported" && Boolean(old.executionId || old.assignmentId) &&
      (old.phase === "running" || old.phase === "returning" && (old.returnUntil ?? 0) > now);
    items.push({ ...old, title: todo.title, updatedAt: todo.updatedAt, reason: todo.reason, reportMessageId: todo.reportMessageId,
      phase: returning ? "returning" : phase,
      returnUntil: returning ? old.returnUntil ?? now + ROOM_ROUTING_RETURN_MS : undefined,
    });
  }
  const recent = snapshot.todos.filter((todo) => todo.assigneeId && todo.assigneeId !== snapshot.supervisorId &&
    (terminalPhase(todo) === "reported" || terminalPhase(todo) === "blocked")).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const todo of recent) {
    if (items.some((item) => item.todoId === todo.id && item.botId === todo.assigneeId)) continue;
    if (!matchingTodo(snapshot.todos, todo.id, todo.assigneeId!, todo.assignmentId)) continue;
    items.push({ key: `result:${todo.id}:${todo.reportMessageId ?? todo.updatedAt}`, botId: todo.assigneeId!, todoId: todo.id,
      title: todo.title, updatedAt: todo.updatedAt, phase: terminalPhase(todo)!, reportMessageId: todo.reportMessageId, reason: todo.reason });
  }
  const rank = (item: RoomRoutingItem) => item.phase === "returning" ? 1 : item.phase === "reported" || item.phase === "blocked" || item.phase === "stopped" ? 2 : 0;
  items.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? 0 : (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
  const visible = items.slice(0, ROOM_ROUTING_LIMIT).map((item) => {
    const old = before.find((candidate) => candidate.key === item.key);
    return old && Object.entries(item).every(([key, value]) => old[key as keyof RoomRoutingItem] === value) &&
      Object.entries(old).every(([key, value]) => item[key as keyof RoomRoutingItem] === value) ? old : item;
  });
  return { scope: snapshot.scope, items: visible, overflow: Math.max(0, items.length - ROOM_ROUTING_LIMIT), supervisorRunning: snapshot.supervisorRunning };
}
