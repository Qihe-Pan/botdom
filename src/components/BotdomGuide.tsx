import { useEffect, useState } from "react";
import { activeLocale, t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

interface GuideTopic {
  id: string;
  image?: string;
  zh: { title: string; steps: string[]; caption?: string };
  en: { title: string; steps: string[]; caption?: string };
}
interface Guide { version: string; topics: GuideTopic[] }

export function BotdomGuide({ initialChapter }: { initialChapter?: string } = {}) {
  const [language, setLanguage] = useState<"zh" | "en">(activeLocale().startsWith("zh") ? "zh" : "en");
  const [guide, setGuide] = useState<Guide | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void fetch("/guide/content.json", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Guide unavailable");
      const next = await response.json() as Guide;
      if (!next.topics?.length) throw new Error("Guide has no topics");
      if (controller.signal.aborted) return;
      setGuide(next);
      const wanted = initialChapter ? next.topics.findIndex(topic => topic.id === initialChapter) : -1;
      if (wanted >= 0) setSelected(wanted);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt, initialChapter]);
  const topic = guide?.topics[selected];
  const copy = topic?.[language];
  return <div data-botdom-guide className="flex min-h-0 flex-col text-start">
    <div className="mb-4 flex items-center justify-between gap-3 pr-10">
      <h2 className="text-[17px] font-normal text-ink">{t("guide.title")}</h2>
      <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-ink-secondary hover:bg-raised hover:text-ink" onClick={() => setLanguage(language === "zh" ? "en" : "zh")}>{language === "zh" ? "English" : "中文"}</button>
    </div>
    {failed ? <div role="alert" className="py-8 text-center text-[13px] text-ink-secondary">
      {t("guide.unavailable")}<button type="button" onClick={() => setAttempt(attempt + 1)} className="ml-3 text-accent hover:underline">{t("guide.retry")}</button>
    </div> : !guide ? <p role="status" className="py-8 text-center text-[13px] text-ink-secondary">{t("guide.loading")}</p> : <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row sm:gap-6">
      <nav aria-label={t("guide.chapter")} className="flex shrink-0 gap-1 overflow-x-auto pb-1 sm:max-h-[60vh] sm:w-48 sm:flex-col sm:overflow-y-auto sm:overflow-x-visible sm:pb-0">
        {guide.topics.map((one, index) => <button key={one.id} type="button" onClick={() => setSelected(index)} aria-current={index === selected ? "page" : undefined}
          className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-5 transition-colors motion-reduce:transition-none",
            index === selected ? "bg-accent/10 text-ink" : "text-ink-secondary hover:bg-raised/60 hover:text-ink")}>{one[language].title}</button>)}
      </nav>
      {copy && <article key={`${topic!.id}:${language}`} tabIndex={0} lang={language} className="botdom-guide-body min-w-0 flex-1 overflow-y-auto overscroll-contain pr-2 sm:max-h-[60vh]">
        <h3 className="mb-3 text-[16px] font-medium text-ink">{copy.title}</h3>
        <ol className="list-decimal space-y-3 pl-5 text-[13px] leading-6 text-ink-secondary">{copy.steps.map(step => <li key={step}>{step}</li>)}</ol>
        {topic!.image && <figure className="mt-5"><img src={`/guide/${topic!.image}`} alt={copy.caption ?? ""} className="w-full rounded-xl border border-hairline" /><figcaption className="mt-2 text-[11px] leading-relaxed text-ink-tertiary">{copy.caption}</figcaption></figure>}
      </article>}
    </div>}
    {guide && <p className="mt-4 text-[11px] text-ink-tertiary">Botdom · {guide.version}</p>}
  </div>;
}
