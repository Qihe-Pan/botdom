import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { useStore, type Bot, type BotSettingsSection } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { LocaleKey } from "@/locales";
import { useCaptionChrome } from "./DesktopCapabilities";
import { EmployeeAvatarPicker } from "./EmployeeAvatarPicker";
import { BotAvatar } from "./Avatar";
import { useBotSettingsDerived } from "./bot-settings/useBotSettingsDerived";
import { IdentitySection } from "./bot-settings/IdentitySection";
import { SoulSection } from "./bot-settings/SoulSection";
import { MemorySection } from "./bot-settings/MemorySection";
import { sidePanelCls } from "./bot-panel/side-panel";
import { useBotPanelWidth } from "./bot-panel/use-bot-panel-width";

const BLOCKS: Array<{ id: BotSettingsSection; labelKey: LocaleKey }> = [
  { id: "identity", labelKey: "p0.bot.basic" },
  { id: "soul", labelKey: "p0.bot.instructions" },
  { id: "memory", labelKey: "p0.bot.materials" },
];

function Block({ id, labelKey, children }: { id: BotSettingsSection; labelKey: LocaleKey; children: ReactNode }) {
  // Memory brings its own cards; the others sit in one card each.
  const bare = id === "memory";
  return <section data-bot-settings-section={id} className={bare ? "scroll-mt-3" : "scroll-mt-3 rounded-2xl bg-app p-3.5 ring-1 ring-hairline/35 shadow-[0_1px_2px_rgba(20,15,40,0.04),0_8px_22px_-14px_rgba(20,15,40,0.14)]"}>
    <h3 className={bare ? "mb-2 mt-1 px-1 text-[12px] font-medium text-ink-secondary" : "mb-2.5 text-[13.5px] font-medium text-ink"}>{t(labelKey)}</h3>
    {children}
  </section>;
}

export function BotSettingsDialog({ bot, overlay = false, closing = false }: { bot: Bot; overlay?: boolean; closing?: boolean }) {
  const width = useBotPanelWidth();
  const { state, dispatch } = useStore();
  const derived = useBotSettingsDerived(bot);
  const dialogRef = useRef<HTMLElement | null>(null);
  const { dragProps } = useCaptionChrome();
  const close = () => dispatch({ type: "toggleSettings", open: false });
  const target = BLOCKS.some((block) => block.id === state.botSettingsSection) ? state.botSettingsSection : null;

  useEffect(() => {
    if (!target || target === "identity") return;
    dialogRef.current?.querySelector(`[data-bot-settings-section="${target}"]`)?.scrollIntoView({ block: "start" });
  }, [target]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKey = (event: KeyboardEvent) => {
      const nested = dialog?.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      if (nested && nested.getClientRects().length > 0) return;
      // BotInstructionsDialog portals to document.body: a key pressed with focus outside this dialog is not ours.
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        dispatch({ type: "toggleSettings", open: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [dispatch]);

  const body: Record<string, ReactNode> = {
    identity: <div className="space-y-3">
      <EmployeeAvatarPicker bot={bot} onPatch={derived.patch} preview={false} compact />
      <IdentitySection bot={bot} parts={["name", "title"]} inline patch={derived.patch} activeState={derived.activeState} mascotMotion={derived.mascotMotion} />
    </div>,
    soul: <SoulSection bot={bot} patch={derived.patch} />,
    memory: <MemorySection bot={bot} onToggle={(enabled) => derived.patch({ memoryEnabled: enabled })} />,
  };

  return <aside ref={dialogRef} role="dialog" aria-labelledby="bot-settings-title" tabIndex={-1} data-bot-color={bot.color} style={width.style} {...(closing ? { inert: true, "aria-hidden": true } : {})}
    className={cn(sidePanelCls(overlay, false), "bot-settings-panel md:w-[var(--bot-panel-w,min(420px,42vw))]", closing && "bot-panel-out")}>
    <div role="separator" aria-orientation="vertical" aria-label={t("botSettings.resize")} tabIndex={0} onPointerDown={width.start} onKeyDown={width.key}
      onDoubleClick={width.reset} className="bot-panel-resize absolute inset-y-0 left-0 z-10 hidden w-1.5 -translate-x-1/2 cursor-col-resize md:block" />
    <div {...dragProps} className="bot-settings-hero relative flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
      <BotAvatar bot={bot} size={44} animated={false} />
      <div className="min-w-0 flex-1">
        <span id="bot-settings-title" className="block truncate text-[16px] font-medium text-ink">{bot.name}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-secondary">{bot.title?.trim() || t("botSettings.heroSubtitle")}</span>
      </div>
      <button type="button" onClick={close} aria-label={t("common.close")}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-app hover:text-ink">
        <X size={16} className="pointer-events-none" />
      </button>
    </div>
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-panel px-3 pb-3 pt-0.5">
      {BLOCKS.map((block) => <Block key={block.id} id={block.id} labelKey={block.labelKey}>{body[block.id]}</Block>)}
    </div>
  </aside>;
}
