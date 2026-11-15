import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, NotebookText, Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { api, useStore, type Bot, type Group } from "@/state/store";
import { jumpToMessage } from "@/lib/focus-message";
import { GROUP_DOC_MAX_BYTES, GROUP_DOC_NAME, type GroupDoc, type GroupDocsList } from "../../../shared/group-workspace";
import { useWorkspaceRevision, workspaceError } from "./GroupFilesTab";

function who(by: string | undefined, members: Bot[]): string {
  if (!by) return "";
  if (by === "user") return t("roomTodo.by.user");
  return members.find((bot) => bot.id === by)?.name ?? by;
}

function day(at: number): string {
  return new Date(at).toLocaleDateString([], { month: "numeric", day: "numeric" });
}

export function GroupDocsTab({ group, members }: { group: Group; members: Bot[] }) {
  const { dispatch, state } = useStore();
  const revision = useWorkspaceRevision(group);
  const [list, setList] = useState<GroupDocsList | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    void api<GroupDocsList>(`/api/groups/${group.id}/docs`)
      .then((next) => { if (current) { setList(next); setError(""); } })
      .catch((cause) => { if (current) setError(workspaceError(cause)); });
    return () => { current = false; };
  }, [group.id, revision, reload]);
  if (open) return <DocView group={group} name={open} members={members} onBack={() => { setOpen(null); setReload((value) => value + 1); }}
    onJump={(messageId) => void jumpToMessage(group, messageId, state.transcriptGeneration[group.threadId] ?? 0, dispatch)} />;
  if (creating) return <DocCreate group={group} taken={list?.docs.map((doc) => doc.name) ?? []} onCancel={() => setCreating(false)}
    onCreated={(name) => { setCreating(false); setOpen(name); }} />;
  return <div data-group-docs>
    <div className="mb-4 flex items-start gap-3">
      <p className="min-w-0 flex-1 text-[12px] leading-5 text-ink-secondary">{t("groupDocs.hint")}</p>
      {(!list || list.docs.length > 0) && <button type="button" onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-ink-secondary hover:bg-ink/[0.05] hover:text-ink">
        <Plus size={13} />{t("groupDocs.new")}
      </button>}
    </div>
    {error && <p role="alert" className="px-1 py-8 text-center text-[13px] leading-6 text-ink-secondary">{error}</p>}
    {!error && list && !list.docs.length && <div className="flex flex-col items-center rounded-2xl border border-ink/[0.06] bg-ink/[0.025] px-5 py-8 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-ink/[0.05] text-ink-secondary"><NotebookText size={19} aria-hidden="true" /></span>
      <p className="max-w-[260px] text-[13px] leading-6 text-ink-secondary">{t("groupDocs.empty")}</p>
      <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-panel px-3 py-1.5 text-[12px] text-ink hover:bg-ink/[0.05]"><Plus size={14} aria-hidden="true" />{t("groupDocs.new")}</button>
    </div>}
    <ul className="flex flex-col gap-0.5">
      {list?.docs.map((doc) => <li key={doc.name}>
        <button type="button" onClick={() => setOpen(doc.name)} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-raised/50">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.07] text-accent"><NotebookText size={16} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-ink">{doc.title}</span>
            {doc.summary && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[18px] text-ink-secondary">{doc.summary}</span>}
            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-tertiary">
              <span className="truncate">{doc.name}</span>
              {doc.updatedBy && <span className="shrink-0">· {who(doc.updatedBy, members)}</span>}
              <span className="shrink-0 tabular-nums">· {day(doc.updatedAt)}</span>
              {doc.stale && <span className="shrink-0 text-warning">· {t("groupDocs.stale")}</span>}
            </span>
          </span>
        </button>
      </li>)}
    </ul>
  </div>;
}

function DocView({ group, name, members, onBack, onJump }: { group: Group; name: string; members: Bot[]; onBack: () => void; onJump: (messageId: string) => void }) {
  const [doc, setDoc] = useState<GroupDoc | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    let current = true;
    void api<GroupDoc>(`/api/groups/${group.id}/docs/${encodeURIComponent(name)}`)
      .then((next) => { if (current) setDoc(next); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { current = false; };
  }, [group.id, name]);
  const tooLong = draft !== null && new TextEncoder().encode(draft).length > GROUP_DOC_MAX_BYTES;
  const save = async () => {
    if (draft === null || !doc || tooLong) return;
    setBusy(true); setError("");
    try {
      setDoc(await api<GroupDoc>(`/api/groups/${group.id}/docs/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ text: draft, baseUpdatedAt: doc.updatedAt }) }));
      setDraft(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/groups/${group.id}/docs/${encodeURIComponent(name)}`, { method: "DELETE" }); onBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  };
  return <div data-group-doc={name}>
    <div className="mb-3 flex items-center gap-1">
      <button type="button" onClick={onBack} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-ink-secondary hover:bg-control hover:text-ink"><ArrowLeft size={14} />{t("groupDocs.back")}</button>
      <span className="min-w-0 flex-1" />
      {doc && draft === null && <>
        <button type="button" onClick={() => setDraft(doc.text)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-ink-secondary hover:bg-control hover:text-ink"><Pencil size={13} />{t("groupDocs.edit")}</button>
        <button type="button" onClick={() => setConfirmDelete(true)} aria-label={t("groupDocs.delete")} title={t("groupDocs.delete")} className="flex size-7 items-center justify-center rounded-lg text-ink-secondary hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
      </>}
    </div>
    {confirmDelete && <div role="alertdialog" className="mb-3 flex items-center gap-2 rounded-xl bg-danger/[0.07] px-3 py-2 text-[12px] text-ink">
      <span className="min-w-0 flex-1">{t("groupDocs.deleteConfirm", { name })}</span>
      <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1 text-ink-secondary hover:bg-control">{t("common.cancel")}</button>
      <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg bg-danger px-2.5 py-1 text-white disabled:opacity-50">{t("groupDocs.delete")}</button>
    </div>}
    {error && <p role="alert" className="mb-2 text-[12px] text-danger">{error}</p>}
    {!doc && !error && <p className="py-6 text-center text-[13px] text-ink-secondary">{t("botdom.document.loading")}</p>}
    {doc && draft === null && <>
      <p className="mb-3 text-[11px] text-ink-tertiary">
        {doc.name}{doc.updatedBy && ` · ${who(doc.updatedBy, members)}`} · {day(doc.updatedAt)}
        {doc.messageId && <button type="button" onClick={() => onJump(doc.messageId!)} className="ml-1.5 text-accent hover:underline">{t("groupDocs.source")}</button>}
      </p>
      <div className="botdom-document-prose text-[13px] leading-6 text-ink [&>*+*]:mt-3">
        <Markdown skipHtml remarkPlugins={[remarkGfm]} components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{doc.text}</Markdown>
      </div>
    </>}
    {doc && draft !== null && <>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={doc.title}
        className={cn("min-h-[320px] w-full resize-y rounded-xl border border-hairline/50 bg-inset px-3 py-2.5 font-mono text-[12px] leading-5 text-ink focus:border-accent/50 focus:outline-none", tooLong && "border-danger/60")} />
      <div className="mt-2 flex items-center justify-end gap-2">
        {tooLong && <span className="mr-auto text-[11px] text-danger">{t("groupDocs.tooLong")}</span>}
        <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-control">{t("common.cancel")}</button>
        <button type="button" disabled={busy || tooLong} onClick={() => void save()} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] text-white disabled:opacity-40">{t("groupDocs.save")}</button>
      </div>
    </>}
  </div>;
}

function DocCreate({ group, taken, onCancel, onCreated }: { group: Group; taken: string[]; onCancel: () => void; onCreated: (name: string) => void }) {
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = `${slug.trim().toLowerCase()}.md`;
  const valid = GROUP_DOC_NAME.test(name) && !taken.includes(name);
  const create = async () => {
    if (!valid) return;
    setBusy(true); setError("");
    try {
      await api(`/api/groups/${group.id}/docs/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ text: `# ${slug.trim()}\n\n` }) });
      onCreated(name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  };
  return <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
    <label htmlFor="group-doc-name" className="mb-2 block text-[12px] font-medium text-ink-secondary">{t("groupDocs.nameLabel")}</label>
    <div className="flex items-center gap-1 rounded-xl border border-hairline/50 bg-inset px-3 focus-within:border-accent/50">
      <input id="group-doc-name" autoFocus value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="decisions"
        className="min-w-0 flex-1 bg-transparent py-2.5 text-[13px] text-ink placeholder:text-ink-tertiary focus:outline-none" />
      <span className="text-[13px] text-ink-tertiary">.md</span>
    </div>
    <p className="mt-1.5 text-[11px] text-ink-tertiary">{t("groupDocs.nameHint")}</p>
    {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}
    <div className="mt-3 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-control">{t("common.cancel")}</button>
      <button type="submit" disabled={!valid || busy} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] text-white disabled:opacity-40">{t("groupDocs.create")}</button>
    </div>
  </form>;
}
