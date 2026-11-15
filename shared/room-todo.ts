/** One line on a room conversation's task board. `accepted` is only ever set by the person. */
export type RoomTodoStatus =
  | "todo"
  | "working"
  | "reported"
  | "review_ok"
  | "returned"
  | "blocked"
  | "accepted"
  | "cancelled";

export interface RoomTodoUpdate {
  at: number;
  /** A bot id, or "user" / "system". */
  by: string;
  text: string;
  status?: RoomTodoStatus;
  /** Metadata edits are history, not execution progress. */
  kind?: "brief";
}

export const ROOM_TODO_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type RoomTodoPriority = typeof ROOM_TODO_PRIORITIES[number];

export interface RoomTodo {
  id: string;
  title: string;
  /** Person-authored requirements, editable only before execution. Missing on older tasks. */
  description?: string;
  acceptanceCriteria?: string;
  assigneeId?: string;
  status: RoomTodoStatus;
  /** Missing priority means normal for older boards. */
  priority?: RoomTodoPriority;
  /** Person-controlled order, independent of task status and update time. */
  manualOrder?: number;
  createdBy: "supervisor" | "user";
  /** Whether the person selected the current assignee. Missing on legacy rows with potentially incomplete history. */
  userAssigned?: boolean;
  goalRunId?: string;
  /** A model's short identifier is local to the run that created this row. */
  planAlias?: string;
  instructionHash?: string;
  /** Run that most recently dispatched this item, including an explicitly continued older row. */
  assignedRunId?: string;
  /** Last dispatch attempt, retained so stale execution frames cannot claim this row. */
  assignmentId?: string;
  activeAssignment?: { id: string; runId: string };
  /** The assignee's reply that reported this item, for "jump to message". */
  reportMessageId?: string;
  /** Last completed delivery, retained across repair assignments; revalidate against the archived turn before use. */
  reportCheckpoint?: { messageId: string; assignmentId: string; workerId: string };
  updates: RoomTodoUpdate[];
  createdAt: number;
  updatedAt: number;
}

/** What a supervisor may say about one item in its control envelope. */
export interface RoomTodoPlanEntry {
  id: string;
  existingTask?: RoomTodoReference;
  title?: string;
  assignee?: string;
  status?: RoomTodoSupervisorStatus;
  note?: string;
}

export interface RoomTodoReference { id: string; title: string }

export type RoomTodoSupervisorStatus = "todo" | "review_ok" | "returned" | "blocked" | "cancelled";
const SUPERVISOR_STATUSES: ReadonlySet<string> = new Set<RoomTodoSupervisorStatus>(["todo", "review_ok", "returned", "blocked", "cancelled"]);

export const ROOM_TODO_LIMIT = 60;
const UPDATE_LIMIT = 20;

export function roomTodoUserAssigned(todo: RoomTodo): boolean {
  if (todo.userAssigned !== undefined) return todo.userAssigned;
  return (todo.createdBy === "user" && Boolean(todo.assigneeId)) ||
    todo.updates.some(update => update.kind !== "brief" && update.by === "user" && (update.status === undefined || update.status === "todo") && !update.text) ||
    todo.updates.length >= UPDATE_LIMIT;
}
const TITLE_MAX = 80;
const NOTE_MAX = 300;
export const ROOM_TODO_BRIEF_MAX = 1000;

export const ROOM_TODO_OPEN: ReadonlySet<RoomTodoStatus> = new Set(["todo", "working", "reported", "review_ok", "returned", "blocked"]);

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

export function parseRoomTodoReference(raw: unknown): RoomTodoReference | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const { id, title } = raw as Record<string, unknown>;
  return typeof id === "string" && id.length <= 40 && id.trim() === id && id &&
    typeof title === "string" && title.length <= TITLE_MAX && title.trim() === title && title
    ? { id, title } : undefined;
}

export function todoTitleFrom(instruction: string): string {
  const line = instruction.trim().split(/\n/)[0] ?? "";
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean || "未命名任务";
}

export function parseRoomTodoPlan(raw: unknown): RoomTodoPlanEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RoomTodoPlanEntry[] = [];
  for (const item of raw.slice(0, ROOM_TODO_LIMIT)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const existingTask = parseRoomTodoReference(record.existingTask);
    if (record.existingTask !== undefined && (!existingTask || record.id !== undefined)) continue;
    const id = existingTask?.id ?? text(record.id, 40);
    const key = existingTask ? `existing:${id}` : `alias:${id}`;
    if (!id || seen.has(key)) continue;
    seen.add(key);
    const title = text(record.title, TITLE_MAX);
    const assignee = text(record.assignee, 100);
    const status = typeof record.status === "string" && SUPERVISOR_STATUSES.has(record.status) ? record.status as RoomTodoSupervisorStatus : undefined;
    const note = text(record.note, NOTE_MAX);
    out.push({ id, ...(existingTask ? { existingTask } : {}), ...(title ? { title } : {}), ...(assignee ? { assignee } : {}), ...(status ? { status } : {}), ...(note ? { note } : {}) });
  }
  return out;
}

function push(todo: RoomTodo, update: RoomTodoUpdate): void {
  todo.userAssigned ??= roomTodoUserAssigned(todo);
  todo.updates.push(update);
  if (todo.updates.length > UPDATE_LIMIT) todo.updates.splice(0, todo.updates.length - UPDATE_LIMIT);
  todo.updatedAt = update.at;
}

export function setTodoStatus(todo: RoomTodo, status: RoomTodoStatus, by: string, note: string, at = Date.now()): void {
  if (todo.status === status && !note) return;
  todo.status = status;
  push(todo, { at, by, text: note, status });
}

/** Trim to the newest items, keeping every open one. */
export function capRoomTodos(todos: RoomTodo[]): RoomTodo[] {
  if (todos.length <= ROOM_TODO_LIMIT) return todos;
  const open = todos.filter((todo) => ROOM_TODO_OPEN.has(todo.status));
  const closed = todos.filter((todo) => !ROOM_TODO_OPEN.has(todo.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  const keep = new Set([...open, ...closed.slice(0, Math.max(0, ROOM_TODO_LIMIT - open.length))]);
  return todos.filter((todo) => keep.has(todo));
}

/**
 * Applies a supervisor's plan. A supervisor cannot claim work started, reported or accepted:
 * those come from the run itself and from the person.
 */
export function applyRoomTodoPlan(args: {
  todos: RoomTodo[];
  plan: RoomTodoPlanEntry[];
  supervisorId: string;
  goalRunId?: string;
  resolveMember(reference: string): string | null;
  now?: number;
  newId(): string;
  preserveHistory?: boolean;
}): RoomTodo[] {
  const now = args.now ?? Date.now();
  const todos = args.todos.map((todo) => ({ ...todo, updates: [...todo.updates] }));
  for (const entry of args.plan) {
    let todo = todos.find((candidate) => candidate.id === entry.id);
    const assigneeId = entry.assignee ? args.resolveMember(entry.assignee) ?? undefined : undefined;
    if (!todo) {
      if (!entry.title) continue;
      todo = {
        id: entry.id,
        title: entry.title,
        ...(assigneeId ? { assigneeId } : {}),
        status: "todo",
        manualOrder: nextRoomTodoOrder(todos),
        createdBy: "supervisor",
        userAssigned: false,
        ...(args.goalRunId ? { goalRunId: args.goalRunId } : {}),
        updates: [{ at: now, by: args.supervisorId, text: entry.note ?? "", status: "todo" }],
        createdAt: now,
        updatedAt: now,
      };
      todos.push(todo);
      if (entry.status && entry.status !== "todo") setTodoStatus(todo, entry.status, args.supervisorId, entry.note ?? "", now);
      continue;
    }
    if (todo.status === "accepted" || todo.status === "cancelled") continue;
    if (todo.createdBy === "supervisor" && entry.title && entry.title !== todo.title) {
      todo.title = entry.title;
      todo.updatedAt = now;
    }
    if (assigneeId && assigneeId !== todo.assigneeId && (!roomTodoUserAssigned(todo) || !todo.assigneeId)) {
      todo.assigneeId = assigneeId;
      todo.updatedAt = now;
    }
    if (entry.status && supervisorMayMove(todo, entry.status)) setTodoStatus(todo, entry.status, args.supervisorId, entry.note ?? "", now);
    else if (entry.note) push(todo, { at: now, by: args.supervisorId, text: entry.note });
  }
  return args.preserveHistory ? todos : capRoomTodos(todos);
}

/**
 * While an employee runs an item only the run may finish it, so a supervisor can only mark it blocked or cancelled;
 * review_ok follows a report. Anything else would drop the employee's coming report and leave the row stuck.
 */
export function supervisorMayMove(todo: RoomTodo, status: RoomTodoStatus): boolean {
  if (todo.activeAssignment || todo.status === "working") return status === "blocked" || status === "cancelled";
  if (status === "review_ok") return todo.status === "reported" || todo.status === "review_ok";
  return true;
}

/** The board as the supervisor reads it on its next turn. */
export function roomTodoLedger(todos: readonly RoomTodo[], nameOf: (botId: string) => string, goalRunId?: string, options?: { reportReferences?: boolean }): string {
  const visible = orderedRoomTodos(todos.filter(todo => todo.status !== "cancelled"))
    .filter((todo, index) => index < 30 || Boolean(goalRunId && (todo.goalRunId === goalRunId || todo.assignedRunId === goalRunId)));
  if (!visible.length) return "Task board: empty.";
  const lines = visible.map((todo) => {
    const who = todo.assigneeId ? nameOf(todo.assigneeId) : "unassigned";
    const update = [...todo.updates].reverse().find((update) => update.text && update.kind !== "brief");
    const last = options?.reportReferences && update?.status === "reported" && todo.reportMessageId
      ? `Delivery report: ${todo.reportMessageId}` : update?.text;
    const alias = goalRunId && todo.goalRunId === goalRunId && todo.createdBy === "supervisor" ? ` (current goal alias: ${todo.planAlias ?? todo.id})` : "";
    return `- ${todo.id} [${todo.status}] ${todo.title}${alias} — ${who}${last ? ` — ${last.slice(0, 120)}` : ""} [priority=${todo.priority ?? "normal"}]` +
      (todo.description ? `\n  Person's requirements: ${JSON.stringify(todo.description)}` : "") +
      (todo.acceptanceCriteria ? `\n  Person's acceptance criteria: ${JSON.stringify(todo.acceptanceCriteria)}` : "");
  });
  return ["Task board (priority first, then person-controlled order; follow this order for eligible work, respecting dependencies, available employees and explicit task requests. Do not preempt running work or overwrite person-controlled priority/order. Status is set by the system and the person; you may only set todo, review_ok, returned, blocked or cancelled):", ...lines].join("\n");
}

export type RoomTodoPersonAction =
  | { action: "add"; title: string }
  | { action: "brief"; todoId: string; description: string; acceptanceCriteria: string; expected: { description: string; acceptanceCriteria: string } }
  | { action: "accept" | "return" | "cancel" | "reopen"; todoId: string; note?: string }
  | { action: "priority"; todoId: string; priority: RoomTodoPriority }
  | { action: "move"; todoId: string; targetId: string; position: "before" | "after" };

export function parseRoomTodoPersonAction(body: unknown): RoomTodoPersonAction | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "body must be a JSON object";
  const raw = body as Record<string, unknown>;
  const note = text(raw.note, NOTE_MAX);
  if (raw.action === "assign" || "assigneeId" in raw) return "Task assignees are managed by the group supervisor.";
  if (raw.action === "add") {
    const title = text(raw.title, TITLE_MAX);
    return title ? { action: "add", title } : "title is required";
  }
  const todoId = typeof raw.todoId === "string" && raw.todoId.length <= 40 ? raw.todoId : "";
  if (!todoId) return "todoId is required";
  if (raw.action === "brief") {
    const validText = (value: unknown): value is string => typeof value === "string" && value.length <= ROOM_TODO_BRIEF_MAX;
    const expected = raw.expected as Record<string, unknown> | undefined;
    if (!validText(raw.description) || !validText(raw.acceptanceCriteria) || !expected ||
      !validText(expected.description) || !validText(expected.acceptanceCriteria)) return "Invalid task requirements or acceptance criteria (maximum 1000 characters each).";
    return { action: "brief", todoId, description: raw.description.trim(), acceptanceCriteria: raw.acceptanceCriteria.trim(), expected: { description: expected.description, acceptanceCriteria: expected.acceptanceCriteria } };
  }
  if (raw.action === "priority") {
    return typeof raw.priority === "string" && ROOM_TODO_PRIORITIES.includes(raw.priority as RoomTodoPriority)
      ? { action: "priority", todoId, priority: raw.priority as RoomTodoPriority } : "invalid priority";
  }
  if (raw.action === "move") {
    if (typeof raw.targetId !== "string" || !raw.targetId || raw.targetId.length > 40 || raw.targetId === todoId) return "invalid targetId";
    if (raw.position !== "before" && raw.position !== "after") return "invalid position";
    return { action: "move", todoId, targetId: raw.targetId, position: raw.position };
  }
  if (raw.action === "accept" || raw.action === "return" || raw.action === "cancel" || raw.action === "reopen") {
    return { action: raw.action, todoId, ...(note ? { note } : {}) };
  }
  return "unknown action";
}

const PERSON_STATUS = { accept: "accepted", return: "returned", cancel: "cancelled", reopen: "todo" } as const;

/** Where each person action may start. Accepting or returning needs a report to judge; reopening needs a closed item. */
const PERSON_FROM: Record<keyof typeof PERSON_STATUS, ReadonlySet<RoomTodoStatus>> = {
  accept: new Set(["reported", "review_ok"]),
  return: new Set(["reported", "review_ok", "blocked"]),
  reopen: new Set(["accepted", "cancelled", "blocked", "returned"]),
  cancel: new Set(["todo", "working", "reported", "review_ok", "returned", "blocked"]),
};

/** Why a person's accept / return / reopen / cancel cannot apply to this item now, or null. */
export function roomTodoPersonActionError(todos: readonly RoomTodo[], action: RoomTodoPersonAction): string | null {
  if (action.action === "brief") {
    const matches = todos.filter(item => item.id === action.todoId);
    if (matches.length !== 1) return "unknown or duplicate todoId";
    const todo = matches[0]!;
    if (!roomTodoCanOrder(todo)) return "Only pending tasks can change requirements. This task has already moved on.";
    if ((todo.description ?? "") !== action.expected.description || (todo.acceptanceCriteria ?? "") !== action.expected.acceptanceCriteria) return "Task requirements changed elsewhere. Reopen the editor before saving.";
    return null;
  }
  if (action.action !== "accept" && action.action !== "return" && action.action !== "reopen" && action.action !== "cancel") return null;
  const todo = todos.find(item => item.id === action.todoId);
  if (!todo) return null;
  if (action.action !== "cancel" && todo.activeAssignment) return "This task is still running. Stop it and wait for it to finish first.";
  return PERSON_FROM[action.action].has(todo.status) ? null : `Cannot ${action.action} a task that is ${todo.status}.`;
}

/** Null when the item does not exist. */
export function applyRoomTodoPersonAction(todos: RoomTodo[], action: RoomTodoPersonAction, now = Date.now()): RoomTodo[] | null {
  if (action.action === "add") {
    const used = new Set(todos.map((todo) => todo.id));
    let n = todos.length + 1;
    while (used.has(`t${n}`)) n += 1;
    return capRoomTodos([...todos, {
      id: `t${n}`,
      title: action.title,
      status: "todo",
      manualOrder: nextRoomTodoOrder(todos),
      createdBy: "user",
      userAssigned: false,
      updates: [{ at: now, by: "user", text: "", status: "todo" }],
      createdAt: now,
      updatedAt: now,
    }]);
  }
  if (todos.filter(todo => todo.id === action.todoId).length !== 1) return null;
  if (action.action === "brief") {
    if (roomTodoPersonActionError(todos, action)) return null;
    return todos.map(todo => {
      if (todo.id !== action.todoId || ((todo.description ?? "") === action.description && (todo.acceptanceCriteria ?? "") === action.acceptanceCriteria)) return todo;
      const copy = { ...todo, description: action.description, acceptanceCriteria: action.acceptanceCriteria, updates: [...todo.updates] };
      push(copy, { at: now, by: "user", text: "", kind: "brief" });
      return copy;
    });
  }
  if (action.action === "move" || action.action === "priority") {
    if (roomTodoOrderError(todos, action)) return null;
    if (action.action === "priority") return todos.map(todo => todo.id === action.todoId ? { ...todo, priority: action.priority } : todo);
    const ordered = orderedRoomTodos(todos);
    const source = ordered.find(todo => todo.id === action.todoId)!;
    const remaining = ordered.filter(todo => todo.id !== source.id);
    const targetIndex = remaining.findIndex(todo => todo.id === action.targetId);
    remaining.splice(targetIndex + (action.position === "after" ? 1 : 0), 0, source);
    const positions = new Map(remaining.map((todo, index) => [todo.id, index]));
    return todos.map(todo => roomTodoCanOrder(todo) && (todo.priority ?? "normal") === (source.priority ?? "normal")
      ? { ...todo, manualOrder: positions.get(todo.id)! } : todo);
  }
  return todos.map((todo) => {
    if (todo.id !== action.todoId) return todo;
    const copy = { ...todo, updates: [...todo.updates] };
    setTodoStatus(copy, PERSON_STATUS[action.action], "user", action.note ?? "", now);
    return copy;
  });
}

export function roomTodoCanOrder(todo: RoomTodo): boolean {
  return !todo.activeAssignment && (todo.status === "todo" || todo.status === "returned");
}

export function orderedRoomTodos(todos: readonly RoomTodo[]): RoomTodo[] {
  const rank = (todo: RoomTodo) => ROOM_TODO_PRIORITIES.indexOf(todo.priority ?? "normal");
  return todos.map((todo, index) => ({ todo, index })).sort((a, b) =>
    rank(a.todo) - rank(b.todo) || (a.todo.manualOrder ?? a.index) - (b.todo.manualOrder ?? b.index) || a.index - b.index
  ).map(({ todo }) => todo);
}

export function roomTodoOrderError(todos: readonly RoomTodo[], action: RoomTodoPersonAction): string | null {
  if (action.action !== "move" && action.action !== "priority") return null;
  const source = todos.filter(todo => todo.id === action.todoId);
  if (source.length !== 1) return "unknown or duplicate todoId";
  if (!roomTodoCanOrder(source[0]!)) return "only pending work can be ordered";
  if (action.action === "move") {
    const targets = todos.filter(todo => todo.id === action.targetId);
    if (targets.length !== 1 || action.targetId === action.todoId) return "unknown or duplicate targetId";
    if (!roomTodoCanOrder(targets[0]!)) return "only pending work can be ordered";
    if ((source[0]!.priority ?? "normal") !== (targets[0]!.priority ?? "normal")) return "change priority before moving across priority levels";
  }
  return null;
}

function nextRoomTodoOrder(todos: readonly RoomTodo[]): number {
  return Math.max(-1, ...todos.map((todo, index) => todo.manualOrder ?? index)) + 1;
}
