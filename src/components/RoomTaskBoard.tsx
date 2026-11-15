import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { usePointerReorder, useReorderGlide } from "@/hooks/use-pointer-reorder";
import { ArrowDown, ArrowUp, GripVertical, Check, ChevronDown, CircleAlert, CirclePlay, ClipboardCheck, ListTodo, MessageSquareText, Square, Undo2, UserRound, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { reducedMotion } from "@/lib/onboarding";
import { api, useStore, type Bot, type Group } from "@/state/store";
import { jumpToMessage } from "@/lib/focus-message";
import { applyRoomTodoPersonAction, orderedRoomTodos, roomTodoCanOrder, ROOM_TODO_PRIORITIES, type RoomTodo, type RoomTodoPersonAction, type RoomTodoStatus } from "../../shared/room-todo";
import { useComputerPanelResize } from "./computer-panel-resize";
import { PanelResizeEdge } from "./PanelResizeEdge";
import { BotdomCrown } from "./BotdomCrown";
import { roomActiveMembersLabel, roomExecutionTodo, roomGoalTitle, roomQueueLabel, roomThreadSpeakerIds, roomTodoExecution } from "@/lib/room-threads";
import { BotAvatar } from "./Avatar";
import { ExecutionDetail } from "./ExecutionDetail";
import { WorkBoardSelect } from "./WorkBoardSelect";
import { WorkTaskSections } from "./WorkTaskSections";

type Lane = "working" | "review" | "todo" | "blocked" | "done";
const LANE_OF: Record<RoomTodoStatus, Lane> = {
  working: "working",
  returned: "todo",
  reported: "review",
  review_ok: "review",
  todo: "todo",
  blocked: "blocked",
  accepted: "done",
  cancelled: "done",
};
const LANES: Lane[] = ["working", "review", "todo", "blocked", "done"];
const DOT: Record<RoomTodoStatus, string> = {
  todo: "bg-ink-secondary/50",
  working: "bg-accent animate-pulse motion-reduce:animate-none",
  returned: "bg-warning",
  reported: "bg-accent/60",
  review_ok: "bg-success",
  blocked: "bg-danger",
  accepted: "bg-success",
  cancelled: "bg-ink-secondary/30",
};

export function roomTodos(group: Group): RoomTodo[] {
  return group.tasks?.find((task) => task.threadId === group.threadId)?.todos ?? [];
}

export function todoLane(todo: RoomTodo, group?: Group): Lane {
  const execution = group && roomTodoExecution(group, todo);
  return execution ? execution.state === "running" ? "working" : "todo" : LANE_OF[todo.status];
}

/** Two layers: what you accepted (solid), and finished work still waiting for review or your acceptance (pale),
 * so a board whose work is all done does not read as stuck at zero. */
function ProgressFill({ summary }: { summary: { total: number; done: number; review: number } }) {
  const pct = (count: number) => `${summary.total ? Math.round((count / summary.total) * 100) : 0}%`;
  return <>
    <span data-progress-awaiting="" className="absolute inset-y-0 left-0 rounded-full bg-success/30 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: pct(summary.done + summary.review) }} />
    <span data-progress-done="" className="absolute inset-y-0 left-0 rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none" style={{ width: pct(summary.done) }} />
  </>;
}

export function roomTodoSummary(todos: readonly RoomTodo[], group?: Group) {
  const live = todos.filter((todo) => todo.status !== "cancelled");
  const count = (lane: Lane) => live.filter((todo) => todoLane(todo, group) === lane).length;
  const stopping = group ? live.filter((todo) => {
    const execution = roomTodoExecution(group, todo);
    return execution?.state === "running" && Boolean(group.holds?.[execution.botId]);
  }).length : 0;
  return { total: live.length, done: count("done"), working: count("working") - stopping, stopping, review: count("review"), blocked: count("blocked") };
}

export function memberActiveTodo(group: Group, botId: string): RoomTodo | undefined {
  const active = group.queue?.filter((entry) => entry.threadId === group.threadId && entry.botId === botId && entry.state === "running") ?? [];
  return active.length === 1 ? roomExecutionTodo(group, active[0]!) : undefined;
}

export function TodoExecutionStatus({ group, todo, members }: { group: Group; todo: RoomTodo; members: Bot[] }) {
  const execution = roomTodoExecution(group, todo);
  return <span data-todo-execution={execution?.state} data-execution-id={execution?.executionId} data-assignment-id={execution?.assignmentId}>
    {execution ? execution.state === "running" && group.holds?.[execution.botId] ? t("room.queue.stopping") : roomQueueLabel(execution, (id) => members.find((bot) => bot.id === id)?.name) : t(`roomTodo.status.${todo.status}`)}
  </span>;
}

function todoDot(group: Group, todo: RoomTodo): string {
  return roomTodoExecution(group, todo)?.state === "queued" ? DOT.todo : DOT[todo.status];
}

export function useTodoAction(group: Group) {
  const { dispatch, state: { roomLiveEpoch } } = useStore();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (body: Record<string, unknown>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await api<{ todos?: RoomTodo[]; boardRevision?: number; roomLiveEpoch?: string }>(`/api/groups/${group.id}/tasks/${group.threadId}/todos`, { method: "POST", body: JSON.stringify(body) });
      if (Array.isArray(result?.todos) && Number.isSafeInteger(result.boardRevision) && result.boardRevision! >= 0) {
        dispatch({ type: "roomTodosPatched", groupId: group.id, threadId: group.threadId, todos: result.todos, boardRevision: result.boardRevision!,
          epoch: result.roomLiveEpoch ?? roomLiveEpoch ?? group.roomLiveVersion?.epoch ?? null });
      }
      return true;
    } catch (error) {
      dispatch({ type: "error", message: `${t("roomTodo.failed")}: ${error instanceof Error ? error.message : String(error)}` });
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}

export function roomGoal(group: Group) {
  const run = [...group.messages].reverse().find((message) => message.goalRun)?.goalRun;
  const rawTitle = run?.goal ?? group.tasks?.find((task) => task.threadId === group.threadId)?.title ?? group.name;
  return { title: roomGoalTitle(rawTitle) || group.name, run };
}

function roomTodoDetail(group: Group, todo: RoomTodo) {
  const report = todo.reportMessageId ? group.messages.find((message) => message.id === todo.reportMessageId)?.text : undefined;
  const latest = [...todo.updates].reverse().find((update) => update.text && update.kind !== "brief");
  return todo.status !== "blocked" && todo.status !== "returned" && report
    ? { text: report, system: false } : { text: latest?.text, system: latest?.by === "system" };
}

export function roomTodoResult(group: Group, todo: RoomTodo): string | undefined {
  return roomTodoDetail(group, todo).text;
}

function AcceptanceProgress({ todos, group }: { todos: RoomTodo[]; group: Group }) {
  const summary = roomTodoSummary(todos, group);
  if (!summary.total) return null;
  const label = t("roomTodo.progress", { done: summary.done, total: summary.total });
  return <div className="mt-2 space-y-1.5">
    <div role="progressbar" aria-label={t("roomTodo.acceptanceProgress")} aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.done} aria-valuetext={label}
      className="relative h-1.5 overflow-hidden rounded-full bg-hairline/40">
      <ProgressFill summary={summary} />
    </div>
    <p className="text-[11px] tabular-nums text-ink-secondary">{label}{summary.review > 0 && <span className="text-ink-tertiary"> · {t("roomTodo.awaiting", { count: summary.review })}</span>}</p>
  </div>;
}

function WorkingMembers({ group, members }: { group: Group; members: Bot[] }) {
  const ids = roomThreadSpeakerIds(group, group.threadId);
  if (!ids.length) return null;
  const label = roomActiveMembersLabel(group, ids);
  return <section aria-label={label} className="mb-3 rounded-xl border border-accent/15 p-3">
    <p className="mb-2 text-[12px] text-accent">{label}</p>
    <ul className="space-y-2">
      {ids.map((id) => {
        const bot = members.find((member) => member.id === id);
        const todo = memberActiveTodo(group, id);
        return <li key={id} data-board-working-member={id} className="flex min-w-0 items-center gap-2">
          {id === group.supervisorId ? <BotdomCrown size={24} className="shrink-0 text-amber-500" aria-hidden="true" /> : bot ? <BotAvatar bot={bot} size={24} animated={false} /> : <UserRound size={24} aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-ink">{bot?.name ?? t("sidebar.preview.aBot")}</p>
            <p dir="auto" className="line-clamp-2 text-[11px] text-ink-secondary">{group.holds?.[id] ? t("room.queue.stopping") : todo ? t("roomTodo.memberDoing", { title: todo.title }) : t("room.queue.running")}</p>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

type TaskSummary = ReturnType<typeof roomTodoSummary>;

function taskSummaryMetrics(summary: TaskSummary) {
  return [
    { label: t("roomTodo.progress", { done: summary.done, total: summary.total }), value: `${summary.done}/${summary.total}`, icon: Check, color: "" },
    ...(summary.working > 0 ? [{ label: t("roomTodo.working", { count: summary.working }), value: summary.working, icon: CirclePlay, color: "text-accent" }] : []),
    ...(summary.stopping > 0 ? [{ label: t("roomTodo.stoppingTasks", { count: summary.stopping }), value: summary.stopping, icon: Square, color: "" }] : []),
    ...(summary.review > 0 ? [{ label: t("roomTodo.review", { count: summary.review }), value: summary.review, icon: ClipboardCheck, color: "text-success" }] : []),
    ...(summary.blocked > 0 ? [{ label: t("roomTodo.blocked", { count: summary.blocked }), value: summary.blocked, icon: CircleAlert, color: "text-danger" }] : []),
  ];
}

function taskSummaryLabel(summary: TaskSummary) {
  return `${t("roomTodo.overview")} · ${summary.total ? taskSummaryMetrics(summary).map(metric => metric.label).join(" · ") : t("roomTodo.none")}`;
}

function TaskSummaryLine({ summary, open }: { summary: TaskSummary; open: boolean }) {
  return <span className="botdom-task-summary-line">
    <ListTodo size={14} className="shrink-0 text-accent" aria-hidden="true" />
    <span className="botdom-task-summary-title shrink-0 font-medium text-ink">{t("roomTodo.overview")}</span>
    {summary.total > 0 ? <>
      <span data-progress-live={summary.working > 0 || undefined} className="botdom-task-summary-bar botdom-progress relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline/40" aria-hidden="true"><ProgressFill summary={summary} /></span>
      <span className="botdom-task-summary-metrics">
        {taskSummaryMetrics(summary).map(({ label, value, icon: Icon, color }) => <span key={label} className={cn("botdom-task-summary-metric tabular-nums", color)} title={label}>
          <span className="botdom-task-summary-full">{label}</span>
          <span className="botdom-task-summary-compact" aria-hidden="true"><Icon size={12} className="shrink-0" />{value}</span>
        </span>)}
      </span>
    </> : <span className="truncate">{t("roomTodo.none")}</span>}
    <ChevronDown size={14} className={cn("ml-auto shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
  </span>;
}

export function RoomTaskSummary({ group, open, onToggle }: { group: Group; open: boolean; onToggle: (opener: HTMLButtonElement) => void }) {
  const summary = roomTodoSummary(roomTodos(group), group);
  return <button type="button" data-room-task-summary onClick={(event) => onToggle(event.currentTarget)} aria-expanded={open} aria-label={taskSummaryLabel(summary)}
    className="botdom-task-summary mx-5 mb-2 min-h-9 min-w-0 w-[calc(100%-2.5rem)] rounded-lg px-3 py-1.5 text-left text-[12px] text-ink-secondary transition-colors hover:bg-ink/[0.035] focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none">
    <TaskSummaryLine summary={summary} open={open} />
  </button>;
}

export function RoomTaskProgress({ group, members = [], open, onToggle }: { group: Group; members?: Bot[]; open: boolean; onToggle: () => void }) {
  const { dispatch } = useStore();
  const [expanded, setExpanded] = useState(false);
  const todos = orderedRoomTodos(roomTodos(group));
  const summary = roomTodoSummary(todos, group);
  const { title, run } = roomGoal(group);
  const running = roomThreadSpeakerIds(group, group.threadId);
  const supervisor = members.find((bot) => bot.id === group.supervisorId);
  const visible = todos.filter((todo) => todo.status !== "cancelled").sort((a, b) => {
    const rank = (todo: RoomTodo) => todoLane(todo, group) === "working" ? 0 : todo.status === "blocked" ? 1 : todo.status === "accepted" ? 3 : 2;
    return rank(a) - rank(b);
  }).filter((todo, index) => index < 4 || roomTodoExecution(group, todo)?.state === "running");
  return <section data-room-goal-progress className="mx-5 mb-2 overflow-hidden rounded-xl border border-accent/15 bg-card">
    <div className="flex items-center gap-1 pr-2">
    <button type="button" data-room-task-progress onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-label={taskSummaryLabel(summary)}
      className="botdom-task-summary min-w-0 flex-1 px-3 py-2 text-left text-[12px] text-ink-secondary transition-colors hover:bg-ink/[0.035] focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 motion-reduce:transition-none">
      <TaskSummaryLine summary={summary} open={expanded} />
    </button>
    <button type="button" onClick={onToggle} aria-expanded={open} className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent">{t("roomTodo.title")}</button>
  </div>
    <div className={cn("botdom-sidebar-fold", !expanded && "is-closed")} aria-hidden={!expanded}>
      <div className="botdom-sidebar-fold-content" inert={!expanded || undefined}>
        <div className="max-h-[min(32vh,320px)] overflow-y-auto">
    <div className="flex items-start gap-2.5 px-3 pt-3">
      <BotdomCrown size={17} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-secondary">{t("roomTodo.goal")}{supervisor ? ` · ${supervisor.name}` : ""}</p>
        <p dir="auto" className="line-clamp-2 text-[14px] font-normal leading-5 text-ink" title={title}>{title}</p>
        {run && <p className="mt-1 text-[11px] text-ink-secondary">{t(`goalRun.${run.status}`)} · {t("goalRun.turns", { count: run.turnCount })}</p>}
      </div>
      {running.length > 0 && <span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[11px] text-accent">{roomActiveMembersLabel(group, running)}</span>}
    </div>
    {visible.length > 0 ? <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-2">
      {visible.map((todo) => {
        const assignee = members.find((bot) => bot.id === todo.assigneeId);
        const result = roomTodoDetail(group, todo);
        return <article key={todo.id} data-room-subtask={todo.id} data-status={todo.status} className="min-w-0 rounded-lg border border-hairline/40 bg-app p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
            {assignee ? <BotAvatar bot={assignee} size={18} animated={false} /> : <UserRound size={14} />}
            <span className="min-w-0 flex-1 truncate">{assignee?.name ?? t("roomTodo.unassigned")}</span>
            <span className={cn("size-1.5 shrink-0 rounded-full", todoDot(group, todo))} aria-hidden="true" />
            <span className={cn("shrink-0", todo.status === "blocked" && "text-danger")}><TodoExecutionStatus group={group} todo={todo} members={members} /></span>
          </div>
          <p dir="auto" className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-ink">{todo.title}</p>
          <p className="text-[11px] text-ink-secondary">{t(`roomTodo.priority.${todo.priority ?? "normal"}`)}</p>
          {result.text && <ExecutionDetail text={result.text} system={result.system} className={cn("mt-1 text-[12px] leading-5", todo.status === "blocked" ? "text-danger" : "text-ink-secondary")} />}
          {todo.reportMessageId && <button type="button" className="mt-1 text-[11px] text-accent hover:underline" onClick={() => dispatch({ type: "focusMessage", threadId: group.threadId, messageId: todo.reportMessageId! })}>{t("roomTodo.jump")}</button>}
        </article>;
      })}
    </div> : <p className="px-3 pb-3 text-[12px] leading-5 text-ink-secondary">{t("roomTodo.empty")}</p>}
    {summary.total > visible.length && <button type="button" onClick={() => { if (!open) onToggle(); }} className="w-full border-t border-hairline/40 py-2 text-[12px] text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2">{t("roomTodo.allTasks", { count: summary.total })}</button>}
        </div>
      </div>
    </div>
  </section>;
}

export function RoomTaskBoard({ group, members, onClose, style, closing = false }: { closing?: boolean; group: Group; members: Bot[]; onClose: () => void; style?: CSSProperties }) {
  const resize = useComputerPanelResize({ storageKey: "botdom.taskBoardWidth", minWidth: 300, maxWidth: 800, defaultWidth: 360 });
  const todos = orderedRoomTodos(roomTodos(group));
  const [shown, setShown] = useState(reducedMotion());
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    if (closing) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, closing]);
  return <aside inert={closing || undefined} aria-hidden={closing || undefined} data-room-task-board aria-label={t("roomTodo.title")} style={{ ...style, width: resize.panelWidth }}
    className={cn(
      "absolute right-3 top-3 z-[26] flex max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-card shadow-xl",
      "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
      shown && !closing ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0",
    )}>
    <PanelResizeEdge resize={resize} />
    <header className="flex shrink-0 items-center gap-2 border-b border-hairline/40 px-4 py-3">
      <ListTodo size={16} className="text-accent" aria-hidden="true" />
      <h2 className="text-[14px] font-medium text-ink">{t("roomTodo.title")}</h2>
      <span className="text-[12px] tabular-nums text-ink-secondary">{(() => { const s = roomTodoSummary(todos, group); return s.total ? t("roomTodo.progress", { done: s.done, total: s.total }) : ""; })()}</span>
      <button type="button" onClick={onClose} aria-label={t("roomTodo.close")} className="ml-auto flex size-7 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink">
        <X size={16} aria-hidden="true" />
      </button>
    </header>
    <RoomTaskContents group={group} members={members} />
  </aside>;
}


interface BoardOrder {
  todos: RoomTodo[];
  busy: boolean;
  run: (body: RoomTodoPersonAction) => Promise<boolean>;
  notice: { todoId: string; text: string } | null;
  notify: (todoId: string, text: string) => void;
}

/** Same-priority pending work that may trade places with `todo`, in shown order. */
function orderPeers(todos: readonly RoomTodo[], group: Group, todoId: string): string[] | null {
  const todo = todos.find((item) => item.id === todoId);
  if (!todo || !roomTodoCanOrder(todo) || roomTodoExecution(group, todo)) return null;
  const priority = todo.priority ?? "normal";
  return todos.filter((item) => roomTodoCanOrder(item) && !roomTodoExecution(group, item) && (item.priority ?? "normal") === priority).map((item) => item.id);
}

export function RoomTaskContents({ group, members }: { group: Group; members: Bot[] }) {
  const { dispatch, state } = useStore();
  const jump = (messageId: string) => jumpToMessage(group, messageId, state.transcriptGeneration[group.threadId] ?? 0, dispatch);
  const base = roomTodos(group);
  const [preview, setPreview] = useState<RoomTodo[] | null>(null);
  const baseOrder = base.map((todo) => `${todo.id}:${todo.priority ?? ""}:${todo.manualOrder ?? ""}:${todo.status}`).join("|");
  useEffect(() => setPreview(null), [baseOrder]);
  const todos = orderedRoomTodos(preview ?? base);
  const action = useTodoAction(group);
  const [notice, setNotice] = useState<{ todoId: string; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const listRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);
  useReorderGlide(listRef, "data-room-todo", settled);
  const order: BoardOrder = {
    todos, busy: action.busy, notice,
    notify: (todoId, text) => { clearTimeout(noticeTimer.current); setNotice({ todoId, text }); noticeTimer.current = setTimeout(() => setNotice(null), 3200); },
    run: async (body) => {
      const next = applyRoomTodoPersonAction(base, body);
      if (next) setPreview(next);
      const ok = await action.run(body);
      if (!ok) setPreview(null);
      return ok;
    },
  };
  usePointerReorder({
    container: listRef,
    enabled: !action.busy,
    peers: (todoId) => orderPeers(todos, group, todoId),
    onMove: (move) => {
      settled.current = true;
      flushSync(() => { void order.run({ action: "move", todoId: move.key, targetId: move.targetKey, position: move.position }); });
    },
  });
  const [showDone, setShowDone] = useState(false);
  const { title, run } = roomGoal(group);
  const supervisor = members.find((bot) => bot.id === group.supervisorId);
  const doneCount = todos.filter((todo) => LANE_OF[todo.status] === "done").length;
  return (
    <div ref={listRef} className="min-h-0 overflow-y-auto px-3 py-2">
      <div data-board-goal className="mb-3 rounded-xl bg-accent/5 p-3">
        <div className="flex items-center gap-1.5"><BotdomCrown size={15} className="shrink-0 text-amber-500" aria-hidden="true" /><p className="text-[11px] text-accent">{t("roomTodo.goal")}{supervisor ? ` · ${supervisor.name}` : ""}</p></div>
        <p dir="auto" className="mt-1 break-words text-[14px] font-normal leading-5 text-ink">{title}</p>
        {run && <p className="mt-1 text-[11px] text-ink-secondary">{t(`goalRun.${run.status}`)} · {t("goalRun.turns", { count: run.turnCount })}</p>}
        <AcceptanceProgress todos={todos} group={group} />
        <p className="mt-2 text-[11px] leading-4 text-ink-secondary">{t("roomTodo.acceptanceHint")}</p>
      </div>
      <WorkingMembers group={group} members={members} />
      {!todos.length && <p className="px-1 py-6 text-center text-[13px] leading-5 text-ink-secondary">{t("roomTodo.empty")}</p>}
      {LANES.map((lane) => {
        const items = todos.filter((todo) => todoLane(todo, group) === lane);
        if (!items.length) return null;
        if (lane === "done") {
          return <section key={lane} className="mt-2">
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone((value) => !value)} className="flex w-full items-center gap-1 rounded px-1 py-1 text-[12px] text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
              <ChevronDown size={13} className={cn("transition-transform motion-reduce:transition-none", !showDone && "-rotate-90")} aria-hidden="true" />
              {showDone ? t("roomTodo.hideDone") : t("roomTodo.showDone", { count: doneCount })}
            </button>
            {showDone && <div className="mt-1 flex flex-col gap-2">{items.map((todo) => <TodoRow key={`${group.id}:${group.threadId}:${todo.id}`} todo={todo} group={group} members={members} action={action} order={order} onJump={todo.reportMessageId ? () => jump(todo.reportMessageId!) : undefined} />)}</div>}
          </section>;
        }
        return <section key={lane} data-task-lane={lane} className="mt-2 first:mt-0">
          <h3 className="px-1 py-1 text-[12px] font-medium text-ink-secondary">{t(`roomTodo.group.${lane}`)} <span className="tabular-nums">{items.length}</span></h3>
          <div className="flex flex-col gap-2">{items.map((todo) => <TodoRow key={`${group.id}:${group.threadId}:${todo.id}`} todo={todo} group={group} members={members} action={action} order={order}
            onJump={todo.reportMessageId ? () => jump(todo.reportMessageId!) : undefined} />)}</div>
        </section>;
      })}
    </div>
  );
}

function whoName(by: string, members: Bot[]): string {
  if (by === "user") return t("roomTodo.by.user");
  if (by === "system") return t("roomTodo.by.system");
  return members.find((bot) => bot.id === by)?.name ?? by;
}

function clock(at: number): string {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : date.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** A bot's markdown report as plain lines; short text stays whole, long text is previewed in three lines. */
function ReportText({ text, lines, className }: { text: string; lines: 2 | 3; className?: string }) {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^[ \t]{0,3}(#{1,6}|[-*+])[ \t]+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const short = plain.length <= 200 && plain.split("\n").length <= 4;
  return <p dir="auto" className={cn("break-words", short ? "whitespace-pre-wrap" : cn("whitespace-pre-line", lines === 2 ? "line-clamp-2" : "line-clamp-3"), className)}>{plain}</p>;
}

function TodoRow({ todo, group, members, action, order, onJump, initiallyOpen = false }: {
  todo: RoomTodo;
  group: Group;
  members: Bot[];
  action: ReturnType<typeof useTodoAction>;
  order: BoardOrder;
  onJump?: () => Promise<void>;
  initiallyOpen?: boolean;
}) {
  const [jumping, setJumping] = useState(false);
  const previousStatus = useRef(todo.status);
  const [justAccepted, setJustAccepted] = useState(false);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = todo.status;
    if (todo.status !== "accepted" || was === "accepted") return;
    setJustAccepted(true);
    const timer = setTimeout(() => setJustAccepted(false), 1400);
    return () => clearTimeout(timer);
  }, [todo.status]);
  const [everOpen, setEverOpen] = useState(false);
  const toggle = (header: HTMLElement) => {
    if (!open) { setEverOpen(true); setOpen(true); return; }
    setOpen(false);
    const scroller = header.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    const above = header.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
    if (above < 0) scroller.scrollBy({ top: above, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const openReport = async () => {
    if (!onJump || jumping) return;
    setJumping(true);
    try { await onJump(); } catch { order.notify(todo.id, t("roomTodo.reportMissing")); } finally { setJumping(false); }
  };
  const { dispatch } = useStore();
  const [open, setOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState<"return" | null>(null);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (mode === "return") noteRef.current?.focus(); }, [mode]);
  const assignee = members.find((bot) => bot.id === todo.assigneeId);
  const lane = todoLane(todo, group);
  const result = roomTodoDetail(group, todo);
  const sendReturn = async () => {
    const text = note.trim();
    if (!text) return;
    if (!await action.run({ action: "return", todoId: todo.id, note: text })) return;
    dispatch({ type: "sendGroup", groupId: group.id, threadId: group.threadId, text: t("roomTodo.returnMessage", { title: todo.title, id: todo.id, note: text }) });
    setNote("");
    setMode(null);
  };
  const updates = todo.updates.filter((update) => update.text || update.status || update.kind).slice(initiallyOpen ? -20 : -6).reverse();
  const movable = Boolean(orderPeers(order.todos, group, todo.id));
  const Header = initiallyOpen ? "div" : "button";
  return <div data-room-todo={todo.id} data-status={todo.status} data-reorder-key={movable ? todo.id : undefined}
    className={cn("relative rounded-xl px-2 py-1.5 transition-[opacity,background-color] duration-150 hover:bg-raised/50 motion-reduce:transition-none data-[reorder-lifted]:opacity-25", open && !initiallyOpen && "bg-raised/50", initiallyOpen && "rounded-none px-0 py-0 hover:bg-transparent")}>
    <Header type={initiallyOpen ? undefined : "button"} onClick={initiallyOpen ? undefined : (event) => toggle(event.currentTarget)} aria-expanded={initiallyOpen ? undefined : open} className="flex w-full items-start gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-accent">
      <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", todoDot(group, todo))} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] leading-5 text-ink", todo.status === "cancelled" && "text-ink-secondary line-through")}>{todo.title}</span>
        <span className="flex items-center gap-1.5 text-[11px] leading-4 text-ink-secondary">
          {assignee ? <BotAvatar bot={assignee} size={14} /> : <UserRound size={12} aria-hidden="true" />}
          <span className="truncate">{assignee?.name ?? t("roomTodo.unassigned")}</span>
          <span aria-hidden="true">·</span>
          <span data-todo-tone={todo.status} className={cn("inline-flex items-center gap-1", todo.status === "review_ok" && "text-success", todo.status === "blocked" && "text-danger", todo.status === "working" && "text-accent", todo.status === "reported" && "text-warning", todo.status === "accepted" && "todo-accepted")}>
            {justAccepted && <Check size={12} strokeWidth={3} className="todo-accept-pop shrink-0" aria-hidden="true" />}<TodoExecutionStatus group={group} todo={todo} members={members} /></span>
          <span className="ml-auto shrink-0 tabular-nums">{clock(todo.updatedAt)}</span>
        </span>
      </span>
    </Header>
    <TodoOrderControls todo={todo} group={group} order={order} showDragHandle={!initiallyOpen} />
    {order.notice?.todoId === todo.id && <p role="status" className="ml-4 mt-0.5 text-[11px] text-warning">{order.notice.text}</p>}
    {!initiallyOpen && result.text && (result.system
      ? <ExecutionDetail text={result.text} system lines={3} className={cn("ml-4 mt-1 text-[12px] leading-5", todo.status === "blocked" ? "text-danger" : "text-ink-secondary")} />
      : <ReportText text={result.text} lines={3} className={cn("ml-4 mt-1 text-[12px] leading-5", todo.status === "blocked" ? "text-danger" : "text-ink-secondary")} />)}
    <div inert={!open || undefined} data-todo-details={open ? "open" : "closed"}
      className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
    <div className="min-h-0 overflow-hidden">
    {(open || everOpen) && <div className="ml-4 mt-1.5 space-y-2 pb-0.5">
      {initiallyOpen && <WorkTaskSections group={group} todo={todo} action={action} />}
      {updates.length > 0 && <details open={initiallyOpen ? undefined : true} className="py-1">
        <summary className="cursor-pointer rounded py-1 text-[12px] text-ink-secondary focus-visible:outline-2 focus-visible:outline-accent">{t("workBoard.history", { count: updates.length })}</summary>
        <ol className="mt-2 space-y-2 border-l border-hairline/50 pl-2.5">
        {updates.map((update, index) => <li key={`${update.at}-${index}`} className="text-[11px] leading-4 text-ink-secondary">
          <span className="text-ink">{whoName(update.by, members)}</span>
          {update.status && <span> · {t(`roomTodo.status.${update.status}`)}</span>}
          <span className="tabular-nums"> · {clock(update.at)}</span>
          {update.kind === "brief" && <p>{t("workBoard.briefUpdated")}</p>}
          {update.text && (update.by === "system"
            ? <ExecutionDetail text={update.text} system className="text-ink-secondary" />
            : <ReportText text={update.text} lines={2} className="text-ink-secondary" />)}
        </li>)}
      </ol></details>}
      <div className="flex flex-wrap gap-1.5">
        {onJump && <Chip onClick={() => void openReport()} disabled={jumping} hint={t("roomTodo.jumpHint")} icon={<MessageSquareText size={12} />}>{t("roomTodo.jump")}</Chip>}
        {lane === "review" && !todo.activeAssignment && <Chip tone="accent" disabled={action.busy} hint={t("roomTodo.acceptHint")} onClick={() => void action.run({ action: "accept", todoId: todo.id })} icon={<Check size={12} />}>{t("roomTodo.accept")}</Chip>}
        {!todo.activeAssignment && !roomTodoExecution(group, todo) && (lane === "review" || todo.status === "blocked") && <Chip disabled={action.busy} hint={t("roomTodo.returnHint")} onClick={() => setMode(mode === "return" ? null : "return")} icon={<Undo2 size={12} />}>{t("roomTodo.return")}</Chip>}
      </div>
      {mode === "return" && <form className="rounded-xl border border-hairline/50 bg-card p-2 focus-within:border-accent/50" onSubmit={(event) => { event.preventDefault(); void sendReturn(); }}>
        <textarea ref={noteRef} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("roomTodo.returnPlaceholder")} maxLength={1000} rows={3}
          aria-label={t("roomTodo.return")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void sendReturn(); }
            else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMode(null); }
          }}
          className="block max-h-48 min-h-[64px] w-full resize-y bg-transparent px-1 text-[12px] leading-5 text-ink placeholder:text-ink-tertiary focus:outline-none" />
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate px-1 text-[11px] text-ink-tertiary">{t("roomTodo.returnKeys")}</span>
          <button type="button" onClick={() => setMode(null)} className="rounded-lg px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-control">{t("common.cancel")}</button>
          <button type="submit" disabled={!note.trim() || action.busy} className="rounded-lg bg-accent px-2.5 py-1 text-[12px] text-white disabled:opacity-40">{t("roomTodo.returnSend")}</button>
        </div>
      </form>}
    </div>}
    </div>
    </div>
  </div>;
}

function Chip({ children, icon, onClick, disabled, tone, hint }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "accent"; hint?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={hint}
    className={cn("botdom-press flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent",
      tone === "accent" ? "bg-success/15 text-success hover:bg-success/25" : "bg-control text-ink-secondary hover:bg-control-hover hover:text-ink")}>
    <span aria-hidden="true">{icon}</span>{children}
  </button>;
}

export function RoomTaskList({ group, members }: { group: Group; members: Bot[] }) {
  return <RoomTaskContents group={group} members={members} />;
}

export function RoomTaskDetail({ group, todo, members, onJump }: { group: Group; todo: RoomTodo; members: Bot[]; onJump?: () => Promise<void> }) {
  const action = useTodoAction(group);
  const [notice, setNotice] = useState<BoardOrder["notice"]>(null);
  const order: BoardOrder = { todos: orderedRoomTodos(roomTodos(group)), busy: action.busy, run: action.run, notice, notify: (todoId, text) => setNotice({ todoId, text }) };
  return <TodoRow key={todo.id} todo={todo} group={group} members={members} action={action} order={order} onJump={onJump} initiallyOpen />;
}

function TodoOrderControls({ todo, group, order, showDragHandle = true }: { todo: RoomTodo; group: Group; order: BoardOrder; showDragHandle?: boolean }) {
  const priority = todo.priority ?? "normal";
  if (!roomTodoCanOrder(todo) || roomTodoExecution(group, todo)) return <p className="ml-4 text-[11px] text-ink-secondary">{t(`roomTodo.priority.${priority}`)}</p>;
  const peers = order.todos.filter((item) => roomTodoCanOrder(item) && !roomTodoExecution(group, item) && (item.priority ?? "normal") === priority);
  const index = peers.findIndex((item) => item.id === todo.id);
  const move = async (direction: -1 | 1) => {
    const target = peers[index + direction];
    if (!target || order.busy) return;
    await order.run({ action: "move", todoId: todo.id, targetId: target.id, position: direction === -1 ? "before" : "after" });
  };
  const button = "rounded p-1 transition-colors hover:bg-control hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent";
  return <div className="ml-4 mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-secondary">
    {showDragHandle && <button type="button" data-reorder-handle="" disabled={order.busy} aria-label={t("roomTodo.drag", { title: todo.title })}
      title={t("roomTodo.orderHelp")} className={cn(button, "cursor-grab touch-none active:cursor-grabbing")}
      onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); void move(event.key === "ArrowUp" ? -1 : 1); } }}><GripVertical size={14} aria-hidden="true" /></button>}
    <button type="button" disabled={order.busy || index <= 0} aria-label={t("roomTodo.moveUp", { title: todo.title })} onClick={() => void move(-1)} className={button}><ArrowUp size={14} aria-hidden="true" /></button>
    <button type="button" disabled={order.busy || index < 0 || index >= peers.length - 1} aria-label={t("roomTodo.moveDown", { title: todo.title })} onClick={() => void move(1)} className={button}><ArrowDown size={14} aria-hidden="true" /></button>
    <WorkBoardSelect variant="compact" disabled={order.busy} value={priority} label={t("roomTodo.priorityLabel", { title: todo.title })}
      onChange={value => { if (value !== priority) void order.run({ action: "priority", todoId: todo.id, priority: value as RoomTodo["priority"] & string }); }}
      options={ROOM_TODO_PRIORITIES.map(value => ({ value, label: t(`roomTodo.priority.${value}`) }))} />
  </div>;
}
