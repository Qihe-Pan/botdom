import { createHash, randomUUID } from "node:crypto";
import { GROUP_GOAL_CONTROL_OPEN, GROUP_GOAL_CONTROL_CLOSE } from "./group-goal-run.ts";
import { applyRoomTodoPlan, orderedRoomTodos, parseRoomTodoPlan, roomTodoCanOrder, roomTodoUserAssigned, ROOM_TODO_LIMIT, setTodoStatus, todoTitleFrom, type RoomTodo, type RoomTodoPlanEntry, type RoomTodoReference } from "../shared/room-todo.ts";
import type { WireMessage } from "../shared/wire.ts";

export class RoomTodoConflict extends Error {}

export function verifiedRoomTodoReport(messages: readonly WireMessage[], workerId: string, assignmentId: string, turnId?: string): WireMessage | undefined {
  return messages.findLast(message => message.role === "bot" && message.kind === "text" && message.from?.botId === workerId &&
    message.roomAssignmentId === assignmentId && Boolean(message.turnId) && (!turnId || message.turnId === turnId) &&
    message.turnTerminal === true && message.turnSucceeded === true);
}

type ScopedBoard = { todos: RoomTodo[]; supervisorId: string; goalRunId: string; now?: number };

function findAlias(todos: RoomTodo[], runId: string, alias: string): RoomTodo | undefined {
  return todos.find(todo => todo.createdBy === "supervisor" && todo.goalRunId === runId && (todo.planAlias ?? todo.id) === alias);
}

function matchingExisting(todos: RoomTodo[], reference: RoomTodoReference): RoomTodo | undefined {
  const rows = todos.filter(item => item.id === reference.id);
  return rows.length === 1 && rows[0]?.title === reference.title ? rows[0] : undefined;
}

function resolveExisting(todos: RoomTodo[], reference: RoomTodoReference): RoomTodo {
  const row = matchingExisting(todos, reference);
  if (!row) throw new RoomTodoConflict(`Task ${reference.id} no longer matches the task board. Check its current title before continuing.`);
  return row;
}

const firstInstructionLine = (instruction: string) => (instruction.trim().split("\n", 1)[0] ?? "").replace(/\s+/g, " ").trim();

function nativeRoomTodo(todos: RoomTodo[], workerId: string, instruction: string): RoomTodo | undefined {
  const named = todos.filter(todo => todo.title === firstInstructionLine(instruction));
  if (!named.length) return undefined;
  const owned = named.filter(todo => todo.assigneeId === workerId);
  if (!owned.length && named.every(todo => todo.createdBy === "supervisor" && todo.assigneeId &&
      todo.assigneeId !== workerId && !roomTodoUserAssigned(todo))) return undefined;
  if (owned.length !== 1) throw new RoomTodoConflict("The native assignment must identify one exact task for the chosen employee.");
  const todo = owned[0]!;
  assertAvailable(todo);
  if (!roomTodoCanOrder(todo)) throw new RoomTodoConflict(`Task ${todo.id} is not pending. Return or reopen it before continuing.`);
  return todo;
}

export function orderRoomTodoAssignments<T extends { task?: string; existingTask?: RoomTodoReference }>(todos: RoomTodo[], assignments: T[], goalRunId: string): T[] {
  const positions = new Map(orderedRoomTodos(todos).filter(roomTodoCanOrder).map((todo, index) => [todo.id, index]));
  const rank = (item: T) => {
    const task = item.existingTask ? matchingExisting(todos, item.existingTask) : item.task ? findAlias(todos, goalRunId, item.task) : undefined;
    return task ? positions.get(task.id) ?? Infinity : Infinity;
  };
  return [...assignments].sort((a, b) => rank(a) - rank(b));
}

export function orderRoomTodoRecipients(todos: RoomTodo[], botIds: readonly string[], instruction: string): string[] {
  const named = orderedRoomTodos(todos).filter(todo => todo.title === firstInstructionLine(instruction));
  const rank = (botId: string) => {
    const owned = named.filter(todo => todo.assigneeId === botId);
    return owned.length === 1 && roomTodoCanOrder(owned[0]!) ? named.indexOf(owned[0]!) : Infinity;
  };
  return [...botIds].sort((a, b) => rank(a) - rank(b));
}

function assertAvailable(todo: RoomTodo): void {
  if (todo.status === "accepted" || todo.status === "cancelled") {
    throw new RoomTodoConflict(`Task ${todo.id} is closed. Only the person can reopen it.`);
  }
  if (todo.status === "working" || todo.activeAssignment) {
    throw new RoomTodoConflict(`Task ${todo.id} already has an active assignment.`);
  }
}

function canonicalId(todos: RoomTodo[], alias?: string): string {
  if (todos.length >= ROOM_TODO_LIMIT) throw new RoomTodoConflict("The task board is full. Continue an existing item or start another conversation.");
  return alias && !todos.some(todo => todo.id === alias) ? alias : randomUUID();
}

function requireExplicitContinuation(todos: RoomTodo[], alias: string, title: string): void {
  if (todos.some(todo => todo.id === alias && todo.title === title)) {
    throw new RoomTodoConflict(`Task ${alias} is already on the board. Use its full existingTask reference to continue it.`);
  }
}

export function applyScopedRoomTodoPlan(args: ScopedBoard & {
  plan: RoomTodoPlanEntry[];
  resolveMember(reference: string): string | null;
}): RoomTodo[] {
  let todos = args.todos;
  const resolved = new Set<string>();
  for (const entry of args.plan) {
    const existing = entry.existingTask
      ? resolveExisting(todos, entry.existingTask)
      : findAlias(todos, args.goalRunId, entry.id);
    if (!existing) {
      if (!entry.title) throw new RoomTodoConflict(`Task alias ${entry.id} is not linked to this goal. Use an existingTask reference for an older item.`);
      requireExplicitContinuation(todos, entry.id, entry.title);
    }
    if (existing) {
      assertAvailable(existing);
      if (!entry.existingTask && entry.title && entry.title !== existing.title) {
        throw new RoomTodoConflict(`Task alias ${entry.id} is already bound to ${existing.title}. Choose a fresh alias for new work.`);
      }
    }
    const id = existing?.id ?? canonicalId(todos, entry.id);
    if (resolved.has(id)) throw new RoomTodoConflict(`The plan references task ${id} twice.`);
    resolved.add(id);
    todos = applyRoomTodoPlan({
      ...args, todos, preserveHistory: true,
      plan: [{ id, title: existing?.title ?? entry.title,
        // An explicit historical reference authorizes updates to that item, not a change to its identity or owner.
        ...(entry.existingTask ? {} : { assignee: entry.assignee }), status: entry.status, note: entry.note }],
      newId: () => id,
    });
    if (!existing) {
      const created = todos.find(todo => todo.id === id);
      if (created) created.planAlias = entry.id;
    }
  }
  return todos;
}

export function assignRoomTodo(args: ScopedBoard & {
  workerId: string; instruction: string; taskId?: string; existingTask?: RoomTodoReference; assignmentId?: string; nativeTitleReference?: boolean;
}): { todos: RoomTodo[]; todoId: string; assignmentId: string } {
  const now = args.now ?? Date.now();
  const title = todoTitleFrom(args.instruction);
  const instructionHash = createHash("sha256").update(args.instruction.trim()).digest("hex");
  let existing: RoomTodo | undefined;
  if (args.existingTask) existing = resolveExisting(args.todos, args.existingTask);
  else if (args.taskId) {
    existing = findAlias(args.todos, args.goalRunId, args.taskId);
    if (!existing) requireExplicitContinuation(args.todos, args.taskId, args.instruction.trim());
  }
  else {
    const matches = args.todos.filter(todo => (todo.activeAssignment?.runId ?? todo.assignedRunId ?? todo.goalRunId) === args.goalRunId &&
      todo.assigneeId === args.workerId && todo.instructionHash === instructionHash);
    if (matches.length > 1) throw new RoomTodoConflict("Several tasks have this instruction. Name the task before assigning it again.");
    existing = matches[0] ?? (args.nativeTitleReference ? nativeRoomTodo(args.todos, args.workerId, args.instruction) : undefined);
  }
  if (existing) {
    assertAvailable(existing);
    if (roomTodoUserAssigned(existing) && existing.assigneeId && existing.assigneeId !== args.workerId) {
      throw new RoomTodoConflict(`Task ${existing.id} belongs to another employee. Its saved assignee is protected; continue with that employee or ask the group supervisor to arrange separate work.`);
    }
  }
  const todoId = existing?.id ?? canonicalId(args.todos, args.taskId);
  const assignmentId = args.assignmentId ?? randomUUID();
  const todos = applyRoomTodoPlan({
    todos: args.todos, supervisorId: args.supervisorId, goalRunId: args.goalRunId, now, preserveHistory: true,
    plan: [{ id: todoId, title: existing?.title ?? title, assignee: args.workerId }],
    resolveMember: reference => reference === args.workerId ? args.workerId : null,
    newId: () => todoId,
  });
  const todo = todos.find(item => item.id === todoId)!;
  if (existing?.reportMessageId && existing.assignmentId && existing.assigneeId) {
    todo.reportCheckpoint = { messageId: existing.reportMessageId, assignmentId: existing.assignmentId, workerId: existing.assigneeId };
  }
  if (!existing && args.taskId) todo.planAlias = args.taskId;
  todo.instructionHash = instructionHash;
  todo.assignedRunId = args.goalRunId;
  todo.assignmentId = assignmentId;
  todo.activeAssignment = { id: assignmentId, runId: args.goalRunId };
  delete todo.reportMessageId;
  setTodoStatus(todo, "todo", args.supervisorId, args.instruction.slice(0, 300), now);
  return { todos, todoId, assignmentId };
}

export function startRoomTodo(args: { todos: RoomTodo[]; todoId: string; workerId: string; assignmentId: string; now?: number }): RoomTodo[] {
  return args.todos.map(todo => {
    if (todo.id !== args.todoId || todo.activeAssignment?.id !== args.assignmentId || todo.assigneeId !== args.workerId || todo.status !== "todo") return todo;
    const copy = { ...todo, updates: [...todo.updates] };
    setTodoStatus(copy, "working", "system", "", args.now);
    return copy;
  });
}

export function finishRoomTodo(args: {
  todos: RoomTodo[]; todoId: string; workerId: string; assignmentId: string;
  outcome: "reported" | "blocked" | "stopped"; reason?: string; reportMessageId?: string; now?: number;
}): RoomTodo[] {
  return args.todos.map(todo => {
    if (todo.id !== args.todoId || todo.activeAssignment?.id !== args.assignmentId) return todo;
    if (todo.status === "todo" && args.outcome === "reported" && todo.assigneeId === args.workerId) return todo;
    const copy = { ...todo, updates: [...todo.updates] };
    delete copy.activeAssignment;
    if ((todo.status !== "working" && todo.status !== "todo") || todo.assigneeId !== args.workerId) return copy;
    if (args.outcome === "reported" && args.reportMessageId) {
      copy.reportMessageId = args.reportMessageId;
      copy.reportCheckpoint = { messageId: args.reportMessageId, assignmentId: args.assignmentId, workerId: args.workerId };
    }
    setTodoStatus(copy, args.outcome === "stopped" ? "todo" : args.outcome,
      args.outcome === "reported" ? args.workerId : "system", args.reason ?? "", args.now);
    return copy;
  });
}

export function parseRoomTodoReplyPlan(reply: string) {
  const closeAt = reply.lastIndexOf(GROUP_GOAL_CONTROL_CLOSE);
  const openAt = closeAt < 0 ? -1 : reply.lastIndexOf(GROUP_GOAL_CONTROL_OPEN, closeAt);
  if (openAt < 0) return [];
  try {
    const raw: unknown = JSON.parse(reply.slice(openAt + GROUP_GOAL_CONTROL_OPEN.length, closeAt));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? parseRoomTodoPlan((raw as Record<string, unknown>).plan) : [];
  } catch { return []; }
}
