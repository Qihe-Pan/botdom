import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Check, Columns3, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { filterWorkBoard, workBoardItems, workBoardMatchesView, WORK_BOARD_VIEWS, type WorkBoardView, type WorkBoardItem } from "@/lib/work-board";
import { plainPreviewText } from "@/lib/plain-preview";
import { roomGoalTitle } from "@/lib/room-threads";
import { useStore, type Bot, type Group } from "@/state/store";
import { ROOM_TODO_PRIORITIES } from "../../shared/room-todo";
import { BotAvatar } from "./Avatar";
import { WorkBoardColumns } from "./WorkBoardColumns";
import { WorkBoardSelect } from "./WorkBoardSelect";
import { useHeldMenuMotion, useMenuMotion, type MenuMotion } from "./MenuMotion";
import { RoomTaskDetail, roomTodoResult, TodoExecutionStatus, useTodoAction } from "./RoomTaskBoard";

const CONTROL = "min-w-0 rounded-xl border border-hairline/50 bg-menu px-3 py-2 text-[13px] text-ink focus:outline-2 focus:outline-accent disabled:opacity-50";
const BUTTON = "botdom-press inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

export function WorkBoardPage() {
  const { state, dispatch } = useStore();
  const groups = state.groups.filter(group => !group.dm);
  const items = useMemo(() => workBoardItems(state.groups), [state.groups]);
  const [groupId, setGroupId] = useState("");
  const [botId, setBotId] = useState("");
  const [priority, setPriority] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<WorkBoardView>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
  const detailMotion = useHeldMenuMotion(selectedKey);
  const createMotion = useMenuMotion(creating);
  const selected = items.find(item => item.key === detailMotion.value);
  const participants = state.bots.filter(bot => groups.some(group => (!groupId || group.id === groupId) && group.memberIds.includes(bot.id) && group.supervisorId !== bot.id));
  const filtered = filterWorkBoard(items, { groupId, botId, priority, query }, state.bots);
  const visible = filtered.filter(item => workBoardMatchesView(item, view));
  const viewOptions = WORK_BOARD_VIEWS.map(value => ({ value, label: `${t(`workBoard.view.${value}`)} ${filtered.filter(item => workBoardMatchesView(item, value)).length}` }));
  const accepted = filtered.filter(item => item.todo.status === "accepted").length;
  const activeFilters = Boolean(groupId || botId || priority || query || view !== "all");
  const reset = () => { setGroupId(""); setBotId(""); setPriority(""); setQuery(""); setView("all"); };
  const openConversation = (item: WorkBoardItem) => {
    const current = state.groups.find(group => group.id === item.group.id);
    dispatch({ type: "select", id: item.group.id });
    if (current?.threadId !== item.conversation.threadId) dispatch({ type: "switchGroupTask", groupId: item.group.id, threadId: item.conversation.threadId });
  };
  return <main data-work-board className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app text-ink">
    <header className="botdom-board-header shrink-0 px-4 pt-3.5 pb-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="shrink-0 text-[17px] font-normal tracking-tight">{t("workBoard.title")}</h1>
        <span className="botdom-board-count ml-1 truncate text-[11px] tabular-nums text-ink-secondary">{t("workBoard.count", { count: visible.length })}</span>
        <span className="flex-1" />
        <div className="botdom-board-views flex min-w-0 items-center gap-1" aria-label={t("workBoard.views")}>
          {viewOptions.map(option => <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)} className={cn("whitespace-nowrap rounded-md px-2 py-1.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-accent", view === option.value ? "bg-control/65 text-ink" : "text-ink-secondary hover:bg-control/30")}>{option.label}</button>)}
        </div>
        <div className="botdom-board-view-picker hidden min-w-0"><WorkBoardSelect variant="compact" label={t("workBoard.views")} value={view} onChange={value => setView(value as WorkBoardView)} options={viewOptions} /></div>
        <span className="mx-1 h-4 w-px shrink-0 bg-hairline/40" aria-hidden="true" />
        <button type="button" disabled={!groups.some(group => group.tasks?.some(task => !task.archivedAt))} onClick={() => setCreating(true)} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-hairline/60 bg-menu px-2.5 text-[12px] text-ink transition-colors hover:bg-control/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"><Plus size={14} aria-hidden="true" />{t("workBoard.add")}</button>
        <button type="button" aria-label={t("workBoard.back")} title={t("workBoard.back")} className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-control/50 focus-visible:outline-2 focus-visible:outline-accent" onClick={() => dispatch({ type: "showChat" })}><ArrowLeft size={16} aria-hidden="true" /></button>
      </div>
      <div className="botdom-board-toolbar mt-3 flex min-w-0 items-center gap-1">
        <label className="botdom-board-search mr-2 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-hairline/35 bg-menu px-2.5 focus-within:border-accent/60"><Search size={14} className="shrink-0 text-ink-tertiary" aria-hidden="true" /><input type="search" aria-label={t("workBoard.search")} placeholder={t("workBoard.search")} value={query} onChange={event => setQuery(event.target.value)} className="w-full min-w-0 bg-transparent text-[12px] outline-none placeholder:text-ink-tertiary" /></label>
        <WorkBoardSelect label={t("workBoard.group")} value={groupId} onChange={value => { setGroupId(value); setBotId(""); }} options={[{ value: "", label: t("workBoard.allGroups") }, ...groups.map(group => ({ value: group.id, label: group.name }))]} />
        <WorkBoardSelect label={t("workBoard.assignee")} value={botId} onChange={setBotId} options={[{ value: "", label: t("workBoard.allBots") }, { value: "unassigned", label: t("roomTodo.unassigned") }, ...participants.map(bot => ({ value: bot.id, label: bot.name }))]} />
        <WorkBoardSelect label={t("workBoard.priority")} value={priority} onChange={setPriority} options={[{ value: "", label: t("workBoard.allPriorities") }, ...ROOM_TODO_PRIORITIES.map(value => ({ value, label: t(`roomTodo.priority.${value}`) }))]} />
        {activeFilters && <button type="button" onClick={reset} aria-label={t("workBoard.clear")} title={t("workBoard.clear")} className="flex size-7 shrink-0 items-center justify-center rounded-md text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"><X size={13} aria-hidden="true" /><span className="sr-only">{t("workBoard.clear")}</span></button>}
        {view === "all" && <span title={t("workBoard.statusHint")} className="botdom-board-accepted ml-auto flex shrink-0 items-center gap-1.5 pl-3 text-[11px] tabular-nums text-ink-secondary"><Check size={12} className="text-success" aria-hidden="true" />{t("roomTodo.progress", { done: accepted, total: filtered.length })}</span>}
      </div>
      <span role="status" className={cn("text-[12px] text-success", notice ? "mt-2 block" : "sr-only")}>{notice}</span>
    </header>
    {visible.length ? <WorkBoardColumns items={visible} view={view} filterKey={JSON.stringify([groupId, botId, priority, query, view])} renderCard={item => <WorkCard key={item.key} item={item} bots={state.bots} onOpen={() => setSelectedKey(item.key)} />} /> : <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><Columns3 size={32} strokeWidth={1} className="text-ink-tertiary" /><h2 className="text-[16px] font-normal">{t(activeFilters ? "workBoard.noMatch" : "workBoard.empty")}</h2><p className="max-w-md text-[13px] leading-6 text-ink-secondary">{t(activeFilters ? "workBoard.noMatchHint" : "workBoard.emptyHint")}</p>{activeFilters && <button type="button" onClick={reset} className={cn(BUTTON, "bg-control text-accent")}>{t("workBoard.clear")}</button>}</div>}
    {detailMotion.shown && <BoardDialog motion={detailMotion} title={t("workBoard.detail")} onClose={() => setSelectedKey(null)}>
      {selected ? <>
        <p className="mb-1 text-[12px] text-accent">{selected.group.name}</p><p className="mb-4 text-[13px] leading-5 text-ink-secondary">{roomGoalTitle(selected.conversation.title)}</p>
        <RoomTaskDetail key={selected.key} group={selected.group} todo={selected.todo} members={state.bots.filter(bot => selected.group.memberIds.includes(bot.id))} />
        <button type="button" onClick={() => openConversation(selected)} className={cn(BUTTON, "mt-5 w-full border border-hairline/60 text-accent hover:bg-control")}>{t("workBoard.openChat")}<ArrowUpRight size={15} aria-hidden="true" /></button>
      </> : <p role="status" className="py-8 text-[13px] text-ink-secondary">{t("workBoard.unavailable")}</p>}
    </BoardDialog>}
    {createMotion.shown && <BoardDialog motion={createMotion} title={t("workBoard.add")} onClose={() => setCreating(false)}>
      <CreateWorkTask groups={groups} initialGroupId={groupId} onSaved={() => { setCreating(false); reset(); setNotice(t("workBoard.added")); }} />
    </BoardDialog>}
  </main>;
}

function WorkCard({ item, bots, onOpen }: { item: WorkBoardItem; bots: Bot[]; onOpen: () => void }) {
  const { group, todo, conversation } = item;
  const owner = bots.find(bot => bot.id === todo.assigneeId);
  const result = plainPreviewText(roomTodoResult(group, todo) || todo.description || "");
  return <button type="button" data-work-card={item.key} onClick={onOpen} className="min-w-0 rounded-[10px] border border-hairline/40 bg-menu px-3.5 py-3 text-left transition-[border-color,box-shadow] hover:border-hairline/80 hover:shadow-[0_2px_8px_rgb(0_0_0/0.035)] motion-reduce:transition-none">
    <div className="mb-1.5 flex items-center gap-2 text-[11px]"><span className="min-w-0 flex-1 truncate text-ink-secondary" title={`${group.name} · ${roomGoalTitle(conversation.title)}`}>{group.name}</span>{todo.priority && todo.priority !== "normal" && <span className={cn("shrink-0 rounded px-1 py-0.5 text-[10px]", todo.priority === "urgent" ? "bg-danger/10 text-danger" : "text-ink-secondary")}>{t(`roomTodo.priority.${todo.priority}`)}</span>}</div>
    <h3 dir="auto" className="break-words text-[14px] font-normal leading-[1.55]">{todo.title}</h3>
    {result && <p dir="auto" className="mt-1.5 line-clamp-2 break-words text-[12px] leading-5 text-ink-secondary">{result}</p>}
    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-secondary">{owner && <BotAvatar bot={owner} size={18} animated={false} />}<span className="min-w-0 flex-1 truncate">{owner?.name ?? t("roomTodo.unassigned")}</span><span className="shrink-0 tabular-nums text-ink-tertiary" title={new Date(todo.updatedAt).toLocaleString()}>{t("workBoard.updated", { date: new Date(todo.updatedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }) })}</span></div>
    {<p className={cn("mt-1.5 text-[11px] leading-4", todo.status === "blocked" ? "text-danger" : "text-ink-secondary")}><TodoExecutionStatus group={group} todo={todo} members={bots} /></p>}
  </button>;
}

function BoardDialog({ title, children, onClose, motion }: { title: string; children: ReactNode; onClose: () => void; motion: MenuMotion }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useLayoutEffect(() => { if (!motion.closing && document.activeElement === document.body) ref.current?.focus(); });
  return <div {...motion.exitProps} className={cn("absolute inset-0 z-30 flex justify-end bg-black/20 p-3 backdrop-blur-[1px]", motion.className)} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="flex max-h-full w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-menu shadow-xl outline-none" onKeyDown={event => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]') ?? [])].filter(element => !element.closest("[inert]"));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
    }}><div className="flex shrink-0 items-center justify-between border-b border-hairline/40 px-5 py-4"><h2 className="text-[16px] font-normal">{title}</h2><button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-ink-secondary hover:bg-control focus-visible:outline-2 focus-visible:outline-accent"><X size={18} /></button></div><div className="min-h-0 overflow-y-auto p-5">{children}</div></div>
  </div>;
}

function CreateWorkTask({ groups, initialGroupId, onSaved }: { groups: Group[]; initialGroupId: string; onSaved: () => void }) {
  const availableGroups = groups.filter(group => group.tasks?.some(task => !task.archivedAt));
  const [groupId, setGroupId] = useState(availableGroups.find(group => group.id === initialGroupId)?.id ?? availableGroups[0]?.id ?? "");
  const [threadId, setThreadId] = useState("");
  const [title, setTitle] = useState("");
  const group = groups.find(group => group.id === groupId);
  const tasks = group?.tasks?.filter(task => !task.archivedAt) ?? [];
  const task = tasks.find(task => task.threadId === (threadId || group?.threadId)) ?? tasks[0];
  return <>{group && task ? <CreateTaskForm group={{ ...group, threadId: task.threadId }} title={title} onSaved={onSaved}>
    <div className="grid gap-1.5 text-[12px] text-ink-secondary"><span>{t("workBoard.group")}</span><WorkBoardSelect variant="field" label={t("workBoard.group")} value={groupId} onChange={value => { setGroupId(value); setThreadId(""); }} options={availableGroups.map(group => ({ value: group.id, label: group.name }))} /></div>
    <div className="grid gap-1.5 text-[12px] text-ink-secondary"><span>{t("workBoard.conversation")}</span><WorkBoardSelect variant="field" label={t("workBoard.conversation")} value={task.threadId} onChange={setThreadId} options={tasks.map(task => ({ value: task.threadId, label: roomGoalTitle(task.title) }))} /></div>
    <label className="grid gap-1.5 text-[12px] text-ink-secondary">{t("workBoard.taskTitle")}<textarea required maxLength={80} rows={3} className={cn(CONTROL, "resize-none leading-6")} value={title} onChange={event => setTitle(event.target.value)} placeholder={t("workBoard.titlePlaceholder")} /></label>
  </CreateTaskForm> : <p>{t("workBoard.emptyHint")}</p>}</>;
}

function CreateTaskForm({ group, title, children, onSaved }: { group: Group; title: string; children: ReactNode; onSaved: () => void }) {
  const action = useTodoAction(group);
  return <form onSubmit={event => { event.preventDefault(); if (!title.trim() || action.busy) return; void action.run({ action: "add", title: title.trim() }).then(ok => { if (ok) onSaved(); }); }}>
    <fieldset disabled={action.busy} className="grid gap-4">{children}<p className="text-[12px] leading-5 text-ink-secondary">{t("workBoard.createHint")}</p><button type="submit" disabled={!title.trim()} className={cn(BUTTON, "bg-ink text-app")}>{t(action.busy ? "workBoard.saving" : "workBoard.save")}</button></fieldset>
  </form>;
}
