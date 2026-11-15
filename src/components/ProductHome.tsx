import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";
import { BotdomGuide } from "./BotdomGuide";

/** Botdom's bundled product page (public/product), shown full-page; its guide links open the manual over it. */
export function ProductHome() {
  const { dispatch } = useStore();
  const frame = useRef<HTMLIFrameElement>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; chapter?: unknown } | null;
      if (data?.type === "luna-product-guide") setChapter(typeof data.chapter === "string" && /^[a-z-]+$/.test(data.chapter) ? data.chapter : "");
      if (data?.type === "luna-guide-close") dispatch({ type: "showChat" });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [dispatch]);
  useEffect(() => {
    if (chapter === null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setChapter(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapter]);
  return <main className="relative flex h-full min-w-0 flex-1 flex-col bg-app" data-product-home>
    <iframe ref={frame} title={t("botdom.home.title")} src="/product/index.html" className="h-full w-full border-0" />
    {chapter !== null && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]" onClick={(event) => { if (event.target === event.currentTarget) setChapter(null); }}>
      <div role="dialog" aria-modal="true" aria-label={t("guide.title")} className="relative flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-[20px] border border-hairline/40 bg-panel p-6 shadow-2xl">
        <button type="button" onClick={() => setChapter(null)} aria-label={t("common.close")}
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink"><X size={18} /></button>
        <BotdomGuide initialChapter={chapter || undefined} />
      </div>
    </div>}
  </main>;
}
