import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle } from "lucide-react";
import { t } from "@/lib/i18n";
import { DOCUMENT_PDF_LIMIT, DOCUMENT_TEXT_LIMIT, readableDocument, readDocumentBytes } from "@/lib/document-preview";
import { openPdf, type PdfDocument, type PdfLoading } from "@/lib/pdf-library";
import { requestMessageFile, useLocalFileSave, type MessageAttachmentContext } from "./AttachmentPreview";
import { OfficeDocumentContent } from "./OfficeDocumentContent";
import { TableDialog } from "./RichTable";

function DocumentMarkdown({ text }: { text: string }) {
  return <div className="botdom-document-prose text-[13px] leading-6 [&>*+*]:mt-3"><Markdown skipHtml remarkPlugins={[remarkGfm]}
    components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{text}</Markdown></div>;
}

export function DocumentFileCard({ path, name, message }: { path: string; name: string; message: MessageAttachmentContext }) {
  return <DocumentFileCardContent key={JSON.stringify([path, name, message.threadId, message.messageId])} path={path} name={name} message={message} />;
}

function DocumentFileCardContent({ path, name, message }: { path: string; name: string; message: MessageAttachmentContext }) {
  const kind = readableDocument(name) ?? readableDocument(path);
  const office = kind === "docx" || kind === "xlsx" || kind === "pptx";
  const [open, setOpen] = useState(false), [visible, setVisible] = useState(false);
  const [text, setText] = useState<string | null>(null), [error, setError] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), card = useRef<HTMLElement>(null);
  const save = useLocalFileSave(path, name, message);
  useEffect(() => {
    if (!card.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "160px" });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || kind !== "markdown") return;
    const controller = new AbortController();
    void requestMessageFile(path, message, controller.signal).then(response => readDocumentBytes(response, controller.signal, DOCUMENT_TEXT_LIMIT))
      .then(bytes => { if (!controller.signal.aborted) setText(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [visible, kind, path, message.threadId, message.messageId]);
  const heading = text?.match(/^#{1,2}\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, "").trim() || name.replace(/\.(md|markdown)$/i, "");
  return <article ref={card} data-document-card={kind} className="my-2 w-[min(38rem,100%)] max-w-full overflow-hidden rounded-2xl border border-hairline/60 bg-panel shadow-[0_4px_16px_rgba(30,20,55,0.05)]">
    <button ref={trigger} type="button" aria-label={t("botdom.document.open", { name })} onClick={() => setOpen(true)}
      className="block w-full text-start focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus">
      <div className="relative h-52 overflow-hidden bg-panel px-6 py-5 text-ink sm:h-64 sm:px-8 sm:py-6">
        {kind === "markdown" ? text !== null ? <DocumentMarkdown text={text.slice(0, 12_000)} /> : <div className="flex h-full items-center justify-center gap-2 text-[12px] text-ink-secondary">{error ? t("botdom.document.previewUnavailable") : <><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />{t("botdom.document.loading")}</>}</div>
          : visible ? office ? <OfficeDocumentContent path={path} message={message} compact /> : <PdfDocumentContent path={path} message={message} compact /> : <FileText size={32} className="mx-auto mt-10 text-ink-tertiary" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-linear-to-t from-panel to-transparent" />
      </div>
      <div className="flex min-h-14 items-center gap-3 border-t border-hairline/50 px-4 py-3 transition-colors hover:bg-raised">
        <BookOpen size={20} className="shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1"><div dir="auto" className="truncate text-[13px] font-medium text-ink [unicode-bidi:isolate]">{heading}</div><div className="mt-0.5 text-[11px] text-ink-tertiary">{office ? kind.toUpperCase() : kind === "pdf" ? "PDF" : "Markdown"}</div></div>
        <span className="shrink-0 text-[12px] text-accent">{t("botdom.document.read")}</span>
      </div>
    </button>
    {open && <TableDialog resizeKey="botdom.documentReaderWidth" title={heading} returnFocus={trigger.current} onClose={() => setOpen(false)} className="w-[min(92vw,900px)]" closeLabel={t("botdom.document.close")}>
      <div className="mb-3 flex items-center justify-end gap-2"><button type="button" disabled={save.state === "saving"} onClick={() => void save.save()} className="table-action"><Download size={14} />{t("botdom.document.save")}</button></div>
      {save.state === "failed" && <p role="alert" className="mb-2 text-[12px] text-danger">{save.reason}</p>}
      {office ? <OfficeDocumentContent path={path} message={message} /> : kind === "pdf" ? <PdfDocumentContent path={path} message={message} /> : <MarkdownDocumentContent path={path} message={message} initial={text} />}
    </TableDialog>}
  </article>;
}

function MarkdownDocumentContent({ path, message, initial }: { path: string; message: MessageAttachmentContext; initial: string | null }) {
  const [text, setText] = useState(initial), [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    if (initial !== null) { setText(initial); return; }
    const controller = new AbortController();
    void requestMessageFile(path, message, controller.signal).then(response => readDocumentBytes(response, controller.signal, DOCUMENT_TEXT_LIMIT))
      .then(bytes => { if (!controller.signal.aborted) setText(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [path, message.threadId, message.messageId, initial]);
  return <div className="mx-auto min-h-40 max-w-3xl p-3 sm:p-6">{error ? <p role="alert">{t("botdom.document.loadFailed")}</p> : text === null ? <p role="status">{t("botdom.document.loading")}</p> : <DocumentMarkdown text={text} />}</div>;
}

function PdfDocumentContent({ path, message, compact = false }: { path: string; message: MessageAttachmentContext; compact?: boolean }) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null), [page, setPage] = useState(1), [zoom, setZoom] = useState("fit"), [error, setError] = useState(false);
  const [width, setWidth] = useState(600);
  const holder = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const loading = useRef<PdfLoading | null>(null);
  const thumbnailDone = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); void loading.current?.destroy().catch(() => {}); setError(true); }, 30_000);
    void (async () => {
      const response = await requestMessageFile(path, message, controller.signal);
      const bytes = await readDocumentBytes(response, controller.signal, DOCUMENT_PDF_LIMIT);
      controller.signal.throwIfAborted();
      const task = await openPdf(bytes);
      if (controller.signal.aborted) { void task.promise.catch(() => {}); await task.destroy(); return; }
      loading.current = task;
      const document = await task.promise;
      if (!controller.signal.aborted) setPdf(document);
    })().catch(() => {
      if (!controller.signal.aborted) { void loading.current?.destroy().catch(() => {}); loading.current = null; setError(true); }
    }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); void loading.current?.destroy().catch(() => {}); loading.current = null; };
  }, [path, message.threadId, message.messageId]);
  useEffect(() => {
    if (!holder.current) return;
    if (compact) { setWidth(holder.current.getBoundingClientRect().width || 600); return; }
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 600));
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [compact]);
  useEffect(() => {
    if (!pdf || !canvas.current || (compact && thumbnailDone.current)) return;
    setError(false);
    let cancelled = false;
    let render: ReturnType<import("@/lib/pdf-library").PdfPage["render"]> | undefined;
    const target = canvas.current;
    void (async () => {
      const sheet = await pdf.getPage(page);
      try {
        if (cancelled) return;
        const base = sheet.getViewport({ scale: 1 });
        if (!Number.isFinite(base.width) || !Number.isFinite(base.height) || base.width <= 0 || base.height <= 0) throw new Error("Invalid PDF page dimensions");
        const scale = zoom === "fit" ? Math.min(2, Math.max(0.2, (width - 24) / base.width)) : Number(zoom);
        const viewport = sheet.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
        target.width = Math.max(1, Math.ceil(viewport.width * ratio)); target.height = Math.max(1, Math.ceil(viewport.height * ratio));
        target.style.width = compact ? "100%" : `${viewport.width}px`; target.style.height = compact ? "auto" : `${viewport.height}px`;
        render = sheet.render({ canvas: target, canvasContext: target.getContext("2d")!, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await render.promise;
      } finally {
        sheet.cleanup();
        if (cancelled) target.width = target.height = 0;
      }
      if (compact && !cancelled) { thumbnailDone.current = true; await loading.current?.destroy().catch(() => {}); loading.current = null; }
    })().catch(reason => {
      if (!cancelled && reason?.name !== "RenderingCancelledException") {
        if (compact) { void loading.current?.destroy().catch(() => {}); loading.current = null; }
        setError(true);
      }
    });
    return () => {
      cancelled = true; render?.cancel();
      if (render) void render.promise.catch(() => {}).finally(() => { target.width = target.height = 0; });
      else target.width = target.height = 0;
    };
  }, [pdf, page, zoom, width, compact]);
  return <div ref={holder} className="min-w-0">
    {!compact && pdf && <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-[12px]">
      <button type="button" className="table-action" aria-label={t("botdom.document.previous")} disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
      <input type="number" aria-label={t("botdom.document.page")} value={page} min={1} max={pdf.numPages} className="w-14 rounded-md border border-hairline bg-panel px-2 py-1 text-center" onChange={event => setPage(Math.max(1, Math.min(pdf.numPages, Number(event.target.value) || 1)))} /><span>/ {pdf.numPages}</span>
      <button type="button" className="table-action" aria-label={t("botdom.document.next")} disabled={page >= pdf.numPages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
      <select aria-label={t("botdom.document.zoom")} value={zoom} onChange={event => setZoom(event.target.value)} className="rounded-md border border-hairline bg-panel px-2 py-1"><option value="fit">{t("botdom.document.fit")}</option>{["0.75", "1", "1.5", "2"].map(value => <option key={value} value={value}>{Number(value) * 100}%</option>)}</select>
    </div>}
    {error && <p role="alert" className="p-6 text-center text-[12px] text-ink-secondary">{t(compact ? "botdom.document.previewUnavailable" : "botdom.document.loadFailed")}</p>}
    {!error && !pdf && <p role="status" className="p-6 text-center text-[12px] text-ink-secondary">{t("botdom.document.loading")}</p>}
    <div hidden={error} className={compact ? "pointer-events-none overflow-hidden" : "max-h-[70dvh] overflow-auto rounded-lg bg-inset p-3"}><canvas key={compact ? "thumbnail" : `${page}:${zoom}:${width}`} ref={canvas} role="img" aria-label={`${t("botdom.document.page")} ${page}`} className="mx-auto max-w-none bg-white" /></div>
  </div>;
}
