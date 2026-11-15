import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import license from "../../LICENSE?raw";
import notice from "../../NOTICE?raw";
import { appVersion, platformLabel } from "@/lib/app-links";
import { productName } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { useOtherServerName } from "@/lib/other-server";
import { BotdomGuide } from "./BotdomGuide";

/** The app's own version first; `server` (useOtherServerName: set only when the app's window shows another server) adds a
 * line naming it with the version its page runs. A browser, or an app too old to say, keeps the page's version on one line. */
export function aboutVersionLines({ app, bundle, platform, server }: {
  app?: { version: string } | null;
  bundle: string;
  platform: string | null;
  server: string | null;
}): string[] {
  const line = (version: string) => `${t("about.version", { version })}${platform ? ` · ${platform}` : ""}`;
  if (!app?.version) return [line(bundle)];
  return server ? [line(app.version), t("about.connectedTo", { name: server, version: bundle })] : [line(app.version)];
}

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<"guide" | "license" | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeAction = useRef(onClose);
  closeAction.current = () => { setDetail(null); onClose(); };
  const closeRef = useRef<HTMLButtonElement>(null);
  const server = useOtherServerName(open);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAction.current();
      }
      if (event.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0]!, last = controls[controls.length - 1]!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => { if (open) closeRef.current?.focus(); }, [open, detail]);

  if (!open) return null;

  const [version, connected] = aboutVersionLines({ app: window.ogb?.app, bundle: appVersion(), platform: platformLabel(window.ogb?.platform), server });

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center botdom-utility-scrim bg-black/30 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && closeAction.current()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        className={`botdom-utility botdom-utility-dialog w-full ${detail ? "max-w-[680px]" : "max-w-[336px]"} rounded-2xl border border-hairline/50 bg-panel p-5 text-center shadow-(--shadow-float)`}
      >
        {!detail && <img src="/app-icon.svg" alt="" width={48} height={48} className="mx-auto size-12" />}
        <h2 id="about-dialog-title" className="mt-3 text-[16px] font-medium text-ink">
          {detail === "guide" ? t("guide.title") : detail === "license" ? t("about.license") : productName()}
        </h2>
        {detail === "guide" && <div className="mt-5"><BotdomGuide /></div>}
        {detail === "license" && <div tabIndex={0} role="region" aria-label={t("about.license")}
          className="mt-4 max-h-[52dvh] overflow-y-auto rounded-xl border border-hairline/60 bg-card p-4 text-left text-xs leading-relaxed text-ink-secondary">
          <pre className="whitespace-pre-wrap break-words font-sans">{license.trim()}</pre>
          <pre className="mt-5 whitespace-pre-wrap break-words border-t border-hairline/50 pt-4 font-sans">{notice.trim()}</pre>
        </div>}
        {!detail && <>
          <p className="mt-1 text-[13px] text-ink-secondary">{version}</p>
          {connected && <p className="mt-0.5 text-[13px] text-ink-secondary">{connected}</p>}
          <p className="mt-3 text-[12px] leading-[19px] text-ink-secondary">{t("about.description")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-[12px]">
            <button type="button" onClick={() => setDetail("guide")} className="botdom-utility-link rounded-lg px-2 py-1 text-accent">{t("guide.title")}</button>
            <button type="button" onClick={() => setDetail("license")} className="botdom-utility-link rounded-lg px-2 py-1 text-accent">{t("about.license")}</button>
          </div>
        </>}
        {detail && <button type="button" onClick={() => setDetail(null)} className="botdom-interactive mt-4 text-[13px] text-accent hover:underline">{t("guide.back")}</button>}
        <button
          ref={closeRef}
          type="button"
          onClick={() => closeAction.current()}
          className="botdom-interactive mt-5 w-full rounded-xl bg-raised px-4 py-2 text-[13px] font-medium text-ink hover:brightness-110"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
