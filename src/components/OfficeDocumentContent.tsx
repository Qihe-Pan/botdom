import { createElement, useEffect, useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OfficeBlock, OfficePreview, OfficeRun } from "../../shared/office-preview";
import { readDocumentBytes } from "@/lib/document-preview";
import { t } from "@/lib/i18n";
import { requestMessageFile, type MessageAttachmentContext } from "./AttachmentPreview";

function Runs({ runs }: { runs: OfficeRun[] }) {
  return runs.map((run, index) => {
    let text: ReactNode = run.text;
    if (run.italic) text = <em>{text}</em>;
    if (run.bold) text = <strong>{text}</strong>;
    return <span key={index}>{text}</span>;
  });
}

function Blocks({ blocks }: { blocks: OfficeBlock[] }) {
  const content: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.type === "listItem") {
      const items = [block];
      while (i + 1 < blocks.length) {
        const next = blocks[i + 1]!;
        if (next.type !== "listItem" || next.ordered !== block.ordered || next.level !== block.level) break;
        items.push(next); i += 1;
      }
      content.push(createElement(block.ordered ? "ol" : "ul", {
        key: i, className: `${block.ordered ? "list-decimal" : "list-disc"} space-y-1 ps-6`,
        style: { marginInlineStart: `${Math.min(8, Math.max(0, block.level)) * 1.25}rem` },
      }, items.map((item, index) => <li key={index}><Runs runs={item.runs} /></li>)));
    } else if (block.type === "table") {
      content.push(<div key={i} className="max-w-full overflow-auto"><table className="w-full border-collapse text-start text-[12px]"><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="min-w-24 border border-hairline p-2 align-top"><Blocks blocks={cell} /></td>)}</tr>)}</tbody></table></div>);
    } else if (block.type === "heading") {
      content.push(createElement(`h${Math.min(6, Math.max(1, block.level))}`, { key: i, className: "text-[1.15em] text-ink" }, <Runs runs={block.runs} />));
    } else content.push(<p key={i} className="whitespace-pre-wrap"><Runs runs={block.runs} /></p>);
  }
  return <div className="space-y-3">{content}</div>;
}

function compactBlocks(blocks: OfficeBlock[], depth = 0): OfficeBlock[] {
  return blocks.slice(0, 6).map(block => block.type === "table"
    ? { ...block, rows: depth >= 2 ? [] : block.rows.slice(0, 3).map(row => row.slice(0, 3).map(cell => compactBlocks(cell, depth + 1))) }
    : { ...block, runs: block.runs.slice(0, 3).map(run => ({ ...run, text: run.text.slice(0, 240) })) });
}

function OfficeBody({ preview, compact }: { preview: OfficePreview; compact: boolean }) {
  const [selected, setSelected] = useState(0);
  const sheetId = useId();
  if (preview.kind === "docx") return preview.blocks.length ? <Blocks blocks={compact ? compactBlocks(preview.blocks) : preview.blocks} /> : <p>{t("botdom.document.officeEmpty")}</p>;
  if (preview.kind === "xlsx") {
    const sheet = preview.sheets[selected];
    return <>
      {!compact && <div role="tablist" aria-label={t("botdom.document.sheets")} className="mb-4 flex gap-1 overflow-x-auto border-b border-hairline">{preview.sheets.map((item, index) => <button key={index} type="button" role="tab" aria-selected={selected === index} id={`${sheetId}-tab-${index}`} aria-controls={`${sheetId}-panel-${index}`}
        tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
          let next: number | undefined;
          if (event.key === "ArrowRight") next = (selected + 1) % preview.sheets.length;
          else if (event.key === "ArrowLeft") next = (selected - 1 + preview.sheets.length) % preview.sheets.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = preview.sheets.length - 1;
          if (next !== undefined) { event.preventDefault(); setSelected(next); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus(); }
        }} className={`shrink-0 border-b-2 px-3 py-2 text-[12px] ${selected === index ? "border-accent text-accent" : "border-transparent text-ink-secondary"}`}>{item.name}</button>)}</div>}
      {sheet ? <div role={compact ? undefined : "tabpanel"} id={compact ? undefined : `${sheetId}-panel-${selected}`} aria-labelledby={compact ? undefined : `${sheetId}-tab-${selected}`}>
        {compact && <p className="mb-2 text-[12px] text-ink-secondary">{sheet.name}</p>}
        {sheet.truncated && <p role="status" className="mb-3 text-[12px] text-ink-secondary">{t("botdom.document.sheetTruncated")}</p>}
        {sheet.rows.length ? <div className="max-h-[60dvh] max-w-full overflow-auto"><table aria-label={sheet.name} className="w-full border-collapse text-start text-[12px]"><tbody>{(compact ? sheet.rows.slice(0, 6) : sheet.rows).map((row, r) => <tr key={r}>{(compact ? row.slice(0, 6) : row).map((value, c) => <td key={c} className="min-w-20 max-w-80 whitespace-pre-wrap break-words border border-hairline px-3 py-2 align-top">{value}</td>)}</tr>)}</tbody></table></div> : <p>{t("botdom.document.officeEmpty")}</p>}
      </div> : <p>{t("botdom.document.officeEmpty")}</p>}
    </>;
  }
  const slide = preview.slides[selected];
  return <>
    {!compact && preview.slides.length > 0 && <div className="mb-4 flex items-center justify-center gap-3 text-[12px]">
      <button type="button" className="table-action" aria-label={t("botdom.document.previousSlide")} disabled={selected === 0} onClick={() => setSelected(selected - 1)}><ChevronLeft size={16} /></button>
      <span aria-live="polite">{t("botdom.document.slideCount", { current: selected + 1, total: preview.slides.length })}</span>
      <button type="button" className="table-action" aria-label={t("botdom.document.nextSlide")} disabled={selected >= preview.slides.length - 1} onClick={() => setSelected(selected + 1)}><ChevronRight size={16} /></button>
    </div>}
    {slide ? <section className="space-y-4 rounded-xl border border-hairline bg-panel p-5 sm:p-8"><h2 className="text-lg text-ink">{slide.title || t("botdom.document.slideTitle", { number: selected + 1 })}</h2>{(compact ? slide.paragraphs.slice(0, 3).map(text => text.slice(0, 240)) : slide.paragraphs).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}</section> : <p>{t("botdom.document.officeEmpty")}</p>}
  </>;
}

export function OfficeDocumentContent({ path, message, compact = false }: { path: string; message: MessageAttachmentContext; compact?: boolean }) {
  const [preview, setPreview] = useState<OfficePreview | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setError(null);
    void requestMessageFile(path, message, controller.signal, { preview: "office" })
      .then(response => readDocumentBytes(response, controller.signal, 32 * 1024 * 1024))
      .then(bytes => { const value = JSON.parse(new TextDecoder().decode(bytes)) as OfficePreview; if (!controller.signal.aborted) setPreview(value); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const code = (reason as { code?: string })?.code;
        const status = (reason as { status?: number })?.status;
        setError(code === "office_corrupt" ? t("botdom.document.officeCorrupt") : code === "office_unsupported" ? t("botdom.document.officeUnsupported") : code === "office_too_large" || status === 413 ? t("botdom.document.officeTooLarge") : t("botdom.document.loadFailed"));
      });
    return () => controller.abort();
  }, [path, message.threadId, message.messageId]);
  return <div className={compact ? "pointer-events-none text-[13px] leading-6" : "min-h-40 p-3 text-[13px] leading-6 sm:p-6"}>
    {error ? <p role={compact ? undefined : "alert"}>{error}</p> : preview ? <><OfficeBody key={path} preview={preview} compact={compact} />{!compact && <p className="mt-5 text-[11px] text-ink-tertiary">{t("botdom.document.officeTextOnly")}</p>}</> : <p role={compact ? undefined : "status"}>{t("botdom.document.loading")}</p>}
  </div>;
}
