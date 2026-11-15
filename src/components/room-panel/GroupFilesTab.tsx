import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, Download, File, FileCode2, FileImage, FileSpreadsheet, FileText, Presentation, RefreshCw, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { api, useStore, type Bot, type Group } from "@/state/store";
import { jumpToMessage } from "@/lib/focus-message";
import type { GroupFile, GroupFileKind, GroupFilesPage } from "../../../shared/group-workspace";
import type { RoomTodoStatus } from "../../../shared/room-todo";
import { BotAvatar } from "../Avatar";
import { roomTodos } from "../RoomTaskBoard";

const ICON: Record<GroupFileKind, typeof File> = {
  doc: FileText, sheet: FileSpreadsheet, slides: Presentation, pdf: FileText, markdown: FileText, image: FileImage, code: FileCode2, other: File,
};
type Filter = "all" | "deliverable" | "input";

function relative(at: number): string {
  const date = new Date(at);
  return new Date().toDateString() === date.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}

/** A server without the workspace routes yet answers "no route"; say so plainly instead of showing the raw error. */
export function workspaceError(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  return /no route|404/i.test(text) ? t("groupWorkspace.unavailable") : text;
}

export function useWorkspaceRevision(group: Group): number {
  return (group as Group & { workspaceRevision?: number }).workspaceRevision ?? 0;
}

const READABLE: ReadonlySet<GroupFileKind> = new Set(["doc", "sheet", "slides", "pdf", "markdown", "image"]);

function verifiedFile(file: GroupFile): boolean {
  return Boolean(file.contentHash && /^[a-f0-9]{64}$/.test(file.contentHash)) && file.revisionVerified !== false;
}

/** What a person came to the Files tab for: their uploads, files a bot handed over in a reply, and readable documents a known bot made.
 * Logs, test output and scratch files stay under the folded working files. */
/** Data, logs and tool state: kept for the record, never what a person opens the tab for, even when attached to a reply. */
const PROCESS_FILE = /\.(?:json|jsonl|ndjson|log|lock|map|tmp|temp|cache|pid|db|sqlite|sqlite3|pyc|ds_store)$/i;

export function isUsefulGroupFile(file: GroupFile): boolean {
  if (file.missing) return false;
  if (file.role === "input") return true;
  if (!verifiedFile(file) || !file.botId || PROCESS_FILE.test(file.name || file.path)) return false;
  return Boolean(file.messageId) || READABLE.has(file.kind);
}

export function GroupFilesTab({ group, members }: { group: Group; members: Bot[] }) {
  const { dispatch, state } = useStore();
  const revision = useWorkspaceRevision(group);
  const [page, setPage] = useState<GroupFilesPage | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<GroupFile | null>(null);
  useEffect(() => {
    let current = true;
    setError("");
    void api<GroupFilesPage>(`/api/groups/${group.id}/files${filter === "all" ? "" : `?role=${filter}`}`)
      .then((next) => { if (current) setPage(next); })
      .catch((cause) => { if (current) setError(workspaceError(cause)); });
    return () => { current = false; };
  }, [group.id, filter, revision, reload]);
  const todos = roomTodos(group);
  const todoStatus = useMemo(() => new Map(todos.map((todo) => [todo.id, todo.status])), [todos]);
  const files = page?.files ?? [];
  const useful = files.filter(isUsefulGroupFile);
  const working = files.filter((file) => !isUsefulGroupFile(file));
  const [showWorking, setShowWorking] = useState(false);
  return <div data-group-files>
    <div className="mb-3 flex items-center gap-1.5">
      {(["all", "deliverable", "input"] as const).map((option) => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}
        className={cn("rounded-full px-2.5 py-1 text-[12px] transition-colors motion-reduce:transition-none", filter === option ? "bg-accent/12 text-ink" : "text-ink-secondary hover:bg-raised/60 hover:text-ink")}>
        {t(`groupFiles.filter.${option}`)}
      </button>)}
      <button type="button" onClick={() => setReload((value) => value + 1)} aria-label={t("groupFiles.refresh")} title={t("groupFiles.refresh")}
        className="ml-auto flex size-7 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink"><RefreshCw size={14} /></button>
    </div>
    {error && <p role="alert" className="px-1 py-8 text-center text-[13px] leading-6 text-ink-secondary">{error}</p>}
    {!error && page && !useful.length && <p className="px-1 py-8 text-center text-[13px] leading-6 text-ink-secondary">{t(files.length ? "groupFiles.noneUseful" : "groupFiles.empty")}</p>}
    <ul className="flex flex-col gap-0.5">
      {useful.map((file) => <FileRow key={file.id} file={file} members={members} status={verifiedFile(file) && file.todoId ? todoStatus.get(file.todoId) : undefined} onOpen={() => setPreview(file)} />)}
    </ul>
    {working.length > 0 && <section className="mt-3 border-t border-hairline/40 pt-2">
      <button type="button" aria-expanded={showWorking} onClick={() => setShowWorking((value) => !value)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-secondary hover:bg-raised/50 hover:text-ink">
        <ChevronRight size={13} className={cn("shrink-0 transition-transform duration-150 motion-reduce:transition-none", showWorking && "rotate-90")} aria-hidden="true" />
        <span className="font-medium">{t("groupFiles.working", { count: working.length })}</span>
        <span className="min-w-0 truncate text-ink-tertiary">{t("groupFiles.workingHint")}</span>
      </button>
      {showWorking && <ul className="mt-1 flex flex-col gap-0.5 opacity-80">
        {working.map((file) => <FileRow key={file.id} file={file} members={members} compact status={undefined} onOpen={() => setPreview(file)} />)}
      </ul>}
    </section>}
    {page?.folder && <p className="mt-4 truncate px-1 text-[11px] text-ink-tertiary" title={page.folder}>{t("groupFiles.folder", { path: page.folder })}</p>}
    {preview && <FilePreview group={group} file={preview} onClose={() => setPreview(null)}
      onJump={preview.messageId && preview.threadId ? () => { setPreview(null); if (preview.threadId === group.threadId) void jumpToMessage(group, preview.messageId!, state.transcriptGeneration[group.threadId] ?? 0, dispatch); else dispatch({ type: "focusMessage", threadId: preview.threadId!, messageId: preview.messageId! }); } : undefined} />}
  </div>;
}

function FileRow({ file, members, status, compact = false, onOpen }: { file: GroupFile; members: Bot[]; status?: RoomTodoStatus; compact?: boolean; onOpen: () => void }) {
  const Icon = ICON[file.kind];
  const verified = verifiedFile(file);
  const bot = verified && file.botId ? members.find((member) => member.id === file.botId) : undefined;
  return <li>
    <button type="button" onClick={onOpen} disabled={file.missing}
      className={cn("flex w-full items-start gap-2.5 rounded-xl px-2 text-left hover:bg-raised/50 disabled:opacity-60", compact ? "py-1.5" : "py-2")}>
      <span className={cn("mt-0.5 flex shrink-0 items-center justify-center rounded-lg bg-accent/[0.07] text-accent", compact ? "size-6" : "size-8")}><Icon size={compact ? 13 : 16} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-ink", compact ? "text-[12px]" : "text-[13px]")}>{file.name}</span>
          {file.version > 1 && <span className="shrink-0 rounded bg-raised px-1 text-[10px] tabular-nums text-ink-secondary">{!verified ? t("groupFiles.observation", { count: file.version }) : `v${file.version}`}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-secondary">
          {bot ? <><BotAvatar bot={bot} size={13} animated={false} /><span className="truncate">{bot.name}</span></> : <span>{t(file.role === "input" ? "groupFiles.fromYou" : "groupFiles.unknown")}</span>}
          {verified && file.todoId && <span className="shrink-0">· {file.todoId}</span>}
          {status && <StatusTag status={status} />}
          {!verified && <span className="shrink-0">· {t("groupFiles.unverified")}</span>}
          {file.missing && <span className="shrink-0 text-danger">· {t("groupFiles.missing")}</span>}
          <span className="ml-auto shrink-0 tabular-nums">{relative(file.updatedAt)}</span>
        </span>
      </span>
    </button>
  </li>;
}

function StatusTag({ status }: { status: RoomTodoStatus }) {
  const tone = status === "accepted" ? "text-success" : status === "review_ok" || status === "reported" ? "text-accent" : status === "blocked" ? "text-danger" : "text-ink-secondary";
  return <span className={cn("shrink-0", tone)}>· {t(`roomTodo.status.${status}`)}</span>;
}

const TEXT_KINDS: ReadonlySet<GroupFileKind> = new Set(["markdown", "code"]);

function FilePreview({ group, file, onClose, onJump }: { group: Group; file: GroupFile; onClose: () => void; onJump?: () => void }) {
  const url = `/api/groups/${group.id}/files/${file.id}/content`;
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<false | "changed" | "unavailable">(false);
  useEffect(() => {
    if (!TEXT_KINDS.has(file.kind)) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal }).then(async (response) => {
      if (response.status === 409) { if (!controller.signal.aborted) setFailed("changed"); return; }
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.text();
      if (!controller.signal.aborted) setText(body.slice(0, 400_000));
    }).catch(() => { if (!controller.signal.aborted) setFailed("unavailable"); });
    return () => controller.abort();
  }, [url, file.kind]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={file.name} className="flex max-h-[90dvh] w-[min(92vw,900px)] flex-col overflow-hidden rounded-[20px] border border-hairline/40 bg-panel shadow-2xl">
      <header className="flex shrink-0 items-center gap-2 border-b border-hairline/40 px-5 py-3">
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{file.name}</span>
        {onJump && <button type="button" onClick={onJump} className="rounded-lg px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-control hover:text-ink">{t("groupFiles.jump")}</button>}
        <a href={url} download={file.name} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-control hover:text-ink"><Download size={13} />{t("groupFiles.download")}</a>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex size-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink"><X size={17} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {file.kind === "image" ? <img src={url} alt={file.name} className="mx-auto max-h-[70dvh] rounded-lg" />
          : file.kind === "pdf" ? <iframe title={file.name} src={url} className="h-[72dvh] w-full rounded-lg border border-hairline/40" />
            : TEXT_KINDS.has(file.kind) ? failed ? <p className="text-[13px] text-danger">{t(failed === "changed" ? "groupFiles.changed" : "groupFiles.previewFailed")}</p>
              : text === null ? <p className="text-[13px] text-ink-secondary">{t("botdom.document.loading")}</p>
                : file.kind === "markdown" ? <div className="botdom-document-prose text-[13px] leading-6 [&>*+*]:mt-3"><Markdown skipHtml remarkPlugins={[remarkGfm]} components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{text}</Markdown></div>
                  : <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-ink">{text}</pre>
              : <p className="py-10 text-center text-[13px] leading-6 text-ink-secondary">{t("groupFiles.noPreview")}</p>}
      </div>
    </div>
  </div>;
}
