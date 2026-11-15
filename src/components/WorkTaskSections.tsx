import { useEffect, useState } from "react";
import { api, type Group } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { roomTodoExecution } from "@/lib/room-threads";
import { ROOM_TODO_BRIEF_MAX, roomTodoCanOrder, type RoomTodo } from "../../shared/room-todo";
import type { WireMessage } from "../../shared/wire";
import { AttachmentGallery, replyAttachmentGroup } from "./AttachmentGallery";
import { ChatMarkdown } from "./ChatMarkdown";
import { ExecutionDetail } from "./ExecutionDetail";

const BUTTON = "rounded-md px-2 py-1 text-[12px] text-ink-secondary hover:bg-control/50 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const TEXT = "whitespace-pre-wrap break-words text-[13px] leading-6 text-ink";
type TaskAction = { busy: boolean; run: (body: Record<string, unknown>) => Promise<boolean> };

export function WorkTaskSections({ todo, group, action }: { todo: RoomTodo; group: Group; action: TaskAction }) {
  const [editing, setEditing] = useState(false);
  const editable = roomTodoCanOrder(todo) && !roomTodoExecution(group, todo);
  const latest = [...todo.updates].reverse().find(update => update.kind !== "brief");
  return <div className="space-y-4 pt-3" data-work-task-sections>
    <section className="border-t border-hairline/40 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-[12px] font-normal text-ink-secondary">{t(editing ? "workBoard.editBrief" : "workBoard.requirements")}</h3>
        {editable && !editing && <button type="button" disabled={action.busy} className={BUTTON} onClick={() => setEditing(true)}>{t("workBoard.editBrief")}</button>}
      </div>
      {editing && editable ? <BriefEditor todo={todo} action={action} onClose={() => setEditing(false)} /> : <>
        <p dir="auto" className={TEXT}>{todo.description || t("workBoard.noRequirements")}</p>
        <h3 className="mt-3 mb-1 text-[12px] font-normal text-ink-secondary">{t("workBoard.criteria")}</h3>
        <p dir="auto" className={TEXT}>{todo.acceptanceCriteria || t("workBoard.noCriteria")}</p>
        {!editable && <p className="mt-2 text-[11px] leading-5 text-ink-secondary">{t("workBoard.briefLocked")}</p>}
      </>}
    </section>
    <section className="border-t border-hairline/40 pt-3">
      <h3 className="mb-2 text-[12px] font-normal text-ink-secondary">{t("workBoard.latestProgress")}</h3>
      {latest ? <><ExecutionDetail text={latest.text || (latest.status ? t(`roomTodo.status.${latest.status}`) : t("workBoard.noProgress"))} system={latest.by === "system"} className="text-[13px] leading-6 text-ink" /><p className="mt-1 text-[11px] tabular-nums text-ink-tertiary">{new Date(latest.at).toLocaleString()}</p></> : <p className="text-[13px] text-ink-secondary">{t("workBoard.noProgress")}</p>}
      {todo.status === "blocked" && <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{t("workBoard.blockedHint")}</p>}
    </section>
    <section className="border-t border-hairline/40 pt-3">
      <h3 className="mb-2 text-[12px] font-normal text-ink-secondary">{t("workBoard.report")}</h3>
      {todo.reportMessageId ? <TaskReport key={JSON.stringify([group.threadId, todo.reportMessageId, todo.assignmentId, todo.assigneeId])} todo={todo} threadId={group.threadId} /> : <p className="text-[13px] leading-6 text-ink-secondary">{t("workBoard.noReport")}</p>}
    </section>
  </div>;
}

function BriefEditor({ todo, action, onClose }: { todo: RoomTodo; action: TaskAction; onClose: () => void }) {
  const [expected] = useState(() => ({ description: todo.description ?? "", acceptanceCriteria: todo.acceptanceCriteria ?? "" }));
  const [description, setDescription] = useState(expected.description);
  const [acceptanceCriteria, setCriteria] = useState(expected.acceptanceCriteria);
  const [failed, setFailed] = useState(false);
  const stale = expected.description !== (todo.description ?? "") || expected.acceptanceCriteria !== (todo.acceptanceCriteria ?? "");
  const dirty = description.trim() !== expected.description || acceptanceCriteria.trim() !== expected.acceptanceCriteria;
  const save = async () => {
    if (action.busy || stale || !dirty) return;
    const ok = await action.run({ action: "brief", todoId: todo.id, description, acceptanceCriteria, expected });
    if (ok) onClose(); else setFailed(true);
  };
  return <form onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!action.busy) onClose(); } }}>
    <fieldset disabled={action.busy} className="space-y-3">
      {([["description", description, setDescription], ["criteria", acceptanceCriteria, setCriteria]] as const).map(([key, value, setValue]) => <label key={key} className="block text-[12px] text-ink-secondary">{t(key === "description" ? "workBoard.requirements" : "workBoard.criteria")}
        <textarea value={value} onChange={event => setValue(event.target.value)} rows={3} maxLength={ROOM_TODO_BRIEF_MAX} className="mt-1 block w-full resize-y rounded-lg border border-hairline/50 bg-menu px-2.5 py-2 text-[13px] leading-6 text-ink focus:outline-2 focus:outline-accent" />
      </label>)}
      <p className="text-[11px] leading-5 text-ink-secondary">{t("workBoard.briefHint")}</p>
      {(stale || failed) && <p role="alert" className="text-[12px] leading-5 text-danger">{t(stale ? "workBoard.briefStale" : "workBoard.briefFailed")}</p>}
      <div className="flex justify-end gap-2"><button type="button" className={BUTTON} onClick={onClose}>{t("common.cancel")}</button><button type="submit" disabled={stale || !dirty} className={cn(BUTTON, "bg-ink text-app hover:bg-ink/90")}>{t(action.busy ? "workBoard.saving" : "workBoard.saveBrief")}</button></div>
    </fieldset>
  </form>;
}

function TaskReport({ todo, threadId }: { todo: RoomTodo; threadId: string }) {
  const [message, setMessage] = useState<WireMessage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    void api<{ messages?: WireMessage[] }>(`/api/threads/${encodeURIComponent(threadId)}/messages?around=${encodeURIComponent(todo.reportMessageId!)}&limit=1`).then(result => {
      if (!alive) return;
      const matches = result.messages?.filter(item => item.id === todo.reportMessageId) ?? [];
      const report = matches.length === 1 ? matches[0] : undefined;
      if (!report || report.role !== "bot" || (todo.assigneeId && report.from?.botId !== todo.assigneeId) ||
        (report.roomAssignmentId && todo.assignmentId && report.roomAssignmentId !== todo.assignmentId)) { setStatus("missing"); return; }
      setMessage(report); setStatus("ready");
    }, () => { if (alive) setStatus("failed"); });
    return () => { alive = false; };
  }, [threadId, todo.reportMessageId, todo.assigneeId, todo.assignmentId, attempt]);
  if (status !== "ready" || !message) return <div className="text-[12px] leading-6 text-ink-secondary" role="status">{t(`workBoard.report.${status}`)}{status === "failed" && <button type="button" className={`${BUTTON} ml-1`} onClick={() => setAttempt(value => value + 1)}>{t("workBoard.retry")}</button>}</div>;
  const context = { threadId, messageId: message.id };
  const attachments = replyAttachmentGroup(message.text ?? "", message.attachments);
  return <div data-work-report={message.id} className="min-w-0 text-[13px] leading-6">
    {message.text && <ChatMarkdown text={message.text} message={context} delivered={attachments.delivered} />}
    <AttachmentGallery images={attachments.images} files={attachments.files} message={context} />
    {!message.text && !attachments.images.length && !attachments.files.length && <p className="text-ink-secondary">{t("workBoard.reportEmpty")}</p>}
    <p className="mt-2 text-[11px] text-ink-secondary">{t("workBoard.reportHint")}</p>
  </div>;
}
