import { t } from "@/lib/i18n";

function summary(text: string): string | undefined {
  if (text === "Stopped by you.") return t("executionDetail.stoppedByYou");
  const stopped = /^The turn did not complete \((interrupted|cancelled)\)\.(?: No tool calls were seen before it stopped\.| Before it stopped it made \d+ tool calls?: [^\n]*\.)?(?:\nIts last message, quoted: [\s\S]+)?$/.exec(text);
  return stopped ? t(stopped[1] === "interrupted" ? "executionDetail.interrupted" : "executionDetail.cancelled") : undefined;
}

export function ExecutionDetail({ text, system = true, className, lines = 2, limit = 280 }: {
  text: string; system?: boolean; className?: string; lines?: 2 | 3; limit?: number;
}) {
  if (!system) return <div className={className}><p dir="auto" className="whitespace-pre-wrap break-words">{text}</p></div>;
  const translated = summary(text.trim());
  const full = translated ?? text;
  const shown = full.length > limit ? `${full.slice(0, limit - 1).trimEnd()}…` : full;
  return <div className={className}>
    <p dir="auto" className={lines === 2 ? "line-clamp-2 whitespace-pre-line" : "line-clamp-3 whitespace-pre-line"}>{shown}</p>
    {(system || full.length > limit) && <details className="mt-1 text-[11px] leading-4 text-ink-secondary" data-execution-detail>
      <summary className="w-fit cursor-pointer rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">{t("executionDetail.original")}</summary>
      <pre dir="auto" className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-inset/60 p-2 font-sans">{text}</pre>
    </details>}
  </div>;
}
