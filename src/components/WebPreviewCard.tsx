import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe, Maximize2, RotateCw } from "lucide-react";
import { t } from "@/lib/i18n";
import { openExternalLink } from "@/lib/app-links";
import { DOCUMENT_TEXT_LIMIT, readDocumentBytes } from "@/lib/document-preview";
import { requestMessageFile, type MessageAttachmentContext } from "./AttachmentPreview";
import { TableDialog } from "./RichTable";

const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})?(?:\/[^\s)<>\]"'`，。]*)?/gi;
const MAX_PREVIEWS = 2;

/** Web services a bot started on this machine; Botdom's own ports never preview inside themselves. */
export function localWebUrls(text: string): string[] {
  const own = new Set([typeof window === "undefined" ? "" : window.location.port, "8820", "5220"].filter(Boolean));
  const found: string[] = [];
  for (const match of text.matchAll(LOCAL_URL)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "");
    let url: URL;
    try { url = new URL(raw.replace("0.0.0.0", "127.0.0.1")); } catch { continue; }
    if (own.has(url.port)) continue;
    const key = url.href;
    if (!found.includes(key)) found.push(key);
    if (found.length >= MAX_PREVIEWS) break;
  }
  return found;
}

function WebFrame({ src, srcDoc, title, revision, className }: { src?: string; srcDoc?: string; title: string; revision: number; className: string }) {
  // srcDoc (a delivered .html file) runs scripts but stays cut off from Botdom; a live service keeps its own origin.
  return <iframe key={revision} title={title} src={src} srcDoc={srcDoc} loading="lazy" referrerPolicy="no-referrer"
    sandbox={srcDoc === undefined ? "allow-scripts allow-forms allow-same-origin allow-popups" : "allow-scripts allow-forms allow-popups"}
    className={className} />;
}

export function WebPreviewCard({ url, srcDoc, name }: { url?: string; srcDoc?: string; name?: string }) {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [visible, setVisible] = useState(false);
  const card = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const label = name ?? url ?? "";
  useEffect(() => {
    if (!card.current) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "160px" });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  return <article ref={card} data-web-preview={url ? "service" : "html"}
    className="my-2 w-[38rem] max-w-full overflow-hidden rounded-2xl border border-hairline/60 bg-panel shadow-[0_4px_16px_rgba(30,20,55,0.05)]">
    <div className="relative h-60 overflow-hidden bg-white sm:h-72">
      {visible && <WebFrame src={url} srcDoc={srcDoc} title={label} revision={revision}
        className="pointer-events-none h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-white" />}
      <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-label={t("botdom.web.open", { name: label })}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus" />
    </div>
    <div className="flex min-h-14 items-center gap-3 border-t border-hairline/50 px-4 py-2.5">
      <Globe size={19} className="shrink-0 text-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div dir="auto" className="truncate text-[13px] font-medium text-ink">{name ?? (url ? new URL(url).host : "")}</div>
        <div className="mt-0.5 truncate text-[11px] text-ink-tertiary">{url ?? t("botdom.web.htmlFile")}</div>
      </div>
      <button type="button" onClick={() => setRevision((value) => value + 1)} aria-label={t("botdom.web.reload")} title={t("botdom.web.reload")}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink"><RotateCw size={14} /></button>
      {url && <button type="button" onClick={() => void openExternalLink(url)} aria-label={t("botdom.web.browser")} title={t("botdom.web.browser")}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink"><ExternalLink size={14} /></button>}
      <button type="button" onClick={() => setOpen(true)} className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-accent hover:bg-raised">
        <Maximize2 size={12} />{t("botdom.web.preview")}
      </button>
    </div>
    {open && <TableDialog resizeKey="botdom.webPreviewWidth" title={label} returnFocus={trigger.current} onClose={() => setOpen(false)}
      className="w-[min(94vw,1200px)]" closeLabel={t("common.close")}>
      <WebFrame src={url} srcDoc={srcDoc} title={label} revision={revision} className="h-[min(78vh,900px)] w-full rounded-xl border border-hairline/50 bg-white" />
    </TableDialog>}
  </article>;
}

export function WebPreviews({ text }: { text: string }) {
  const urls = localWebUrls(text);
  if (!urls.length) return null;
  return <div className="flex flex-col items-start">{urls.map((url) => <WebPreviewCard key={url} url={url} />)}</div>;
}

export function isHtmlFile(name: string): boolean {
  return /\.html?$/i.test(name);
}

/** A delivered .html file previews like a page; it is read once and shown in a sandbox with no access to Botdom. */
export function HtmlFilePreview({ path, name, message }: { path: string; name: string; message: MessageAttachmentContext }) {
  const [html, setHtml] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void requestMessageFile(path, message, controller.signal).then((response) => readDocumentBytes(response, controller.signal, DOCUMENT_TEXT_LIMIT))
      .then((bytes) => { if (!controller.signal.aborted) setHtml(new TextDecoder().decode(bytes)); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [path, message.threadId, message.messageId]);
  if (failed) return null;
  if (html === null) return <div className="my-2 flex h-14 w-[min(38rem,100%)] items-center gap-2 rounded-2xl border border-hairline/60 bg-panel px-4 text-[12px] text-ink-secondary"><Globe size={16} />{t("botdom.document.loading")}</div>;
  return <WebPreviewCard srcDoc={html} name={name} />;
}
