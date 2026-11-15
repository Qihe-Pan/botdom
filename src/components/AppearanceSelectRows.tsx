import { useState } from "react";
import { t } from "@/lib/i18n";
import { CHAT_WIDTH_IDS, applyChatWidth, readChatWidth, type ChatWidthId } from "@/lib/chat-width";
import { CUSTOM_FONT_MAX, chooseFont, cleanFontName, readCustomFont, readFont, type FontId } from "@/lib/fonts";
import { cn } from "@/lib/cn";
import { parseSidebarToolsLayout, setSidebarToolsLayout, SIDEBAR_TOOLS_LAYOUTS, useSidebarToolsLayout } from "@/lib/sidebar-preferences";
import { SettingRow } from "./SettingsPrimitives";
import { ChoiceSelect as Select } from "./ChoiceSelect";

/** What each choice looks like on its tile, matching the stylesheet's stacks. */
const FONT_PREVIEW: Partial<Record<FontId, string>> = {
  code: '"Botdom Code", "SF Mono", ui-monospace, Menlo, "PingFang SC", sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Yuanti SC", "PingFang SC", sans-serif',
  handwritten: 'ui-rounded, "Hannotate SC", "Yuanti SC", sans-serif',
  pen: 'ui-rounded, "HanziPen SC", "Yuanti SC", sans-serif',
  cute: 'ui-rounded, "Wawati SC", "Yuanti SC", sans-serif',
  kai: '"Kaiti SC", "STKaiti", serif',
  system: 'system-ui, -apple-system, "PingFang SC", sans-serif',
  inter: '"Inter Variable", "Inter", -apple-system, sans-serif',
  serif: '"Iowan Old Style", "Charter", Georgia, serif',
};
const FONT_TILES: readonly FontId[] = ["code", "rounded", "handwritten", "pen", "cute", "kai", "system", "skin", "inter", "serif", "custom"];

export function FontRow() {
  const [current, setCurrent] = useState<FontId>(readFont);
  const [custom, setCustom] = useState(readCustomFont);
  const choose = (id: FontId, name = custom) => { chooseFont(id, name); setCurrent(id); };
  const commitCustom = (value: string) => { const name = cleanFontName(value); setCustom(name); choose("custom", name); };
  return (
    <div role="group" aria-labelledby="settings-font-title" className="px-4 py-3" data-settings-font>
      <div id="settings-font-title" className="text-[13px] leading-5 text-ink">{t("settings.font.title")}</div>
      <p className="mt-0.5 text-[12px] leading-[18px] text-ink-secondary">{t("settings.font.subtitle")}</p>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
        {FONT_TILES.map((id) => {
          const on = current === id;
          return <button key={id} type="button" aria-pressed={on} onClick={() => choose(id)}
            className={cn("flex min-w-0 flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ink/50",
              on ? "border-ink/40 bg-ink/[0.06]" : "border-hairline/50 hover:border-hairline hover:bg-raised/50")}>
            <span className="w-full truncate text-[17px] leading-6 text-ink"
              style={{ fontFamily: id === "custom" ? (custom ? `"${custom}", -apple-system, sans-serif` : undefined) : id === "skin" ? undefined : FONT_PREVIEW[id] }}>
              {id === "custom" && !custom ? t("settings.font.customSample") : t("settings.font.sample")}
            </span>
            <span className="w-full truncate text-[11.5px] leading-4 text-ink-secondary">{id === "custom" && custom ? custom : t(`settings.font.${id}`)}</span>
          </button>;
        })}
      </div>
      {current === "custom" && <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); commitCustom(new FormData(event.currentTarget).get("font")?.toString() ?? ""); }}>
        <label htmlFor="settings-font-custom" className="text-[12px] text-ink-secondary">{t("settings.font.customLabel")}</label>
        <input id="settings-font-custom" name="font" defaultValue={custom} maxLength={CUSTOM_FONT_MAX} placeholder={t("settings.font.customPlaceholder")}
          onBlur={(event) => commitCustom(event.currentTarget.value)}
          className="min-w-0 flex-1 rounded-lg border border-hairline/50 bg-inset px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-tertiary focus:border-ink/50 focus:outline-none" />
        <button type="submit" className="rounded-lg border border-ink/15 bg-app px-3 py-1.5 text-[12px] text-ink hover:bg-ink/[0.05] focus-visible:outline-2 focus-visible:outline-ink/50">{t("settings.font.customApply")}</button>
        <p className="w-full text-[11.5px] leading-4 text-ink-tertiary">{t("settings.font.customHint")}</p>
      </form>}
    </div>
  );
}

export function ChatWidthRow() {
  const [current, setCurrent] = useState<ChatWidthId>(readChatWidth);
  return (
    <SettingRow title={t("settings.chatWidth.title")} subtitle={t("settings.chatWidth.subtitle")}>
      <Select size="sm" className="w-full max-w-[240px]"
        value={current}
        aria-label={t("settings.chatWidth.aria")}
        onChange={(event) => {
          const id = CHAT_WIDTH_IDS.find((width) => width === event.target.value);
          if (!id) return;
          applyChatWidth(id);
          setCurrent(id);
        }}
      >
        {CHAT_WIDTH_IDS.map((id) => (
          <option key={id} value={id}>{t(`settings.chatWidth.${id}`)}</option>
        ))}
      </Select>
    </SettingRow>
  );
}

export function SidebarToolsLayoutRow() {
  const layout = useSidebarToolsLayout();
  return (
    <SettingRow title={t("sidebar.toolsLayout.title")} subtitle={t("sidebar.toolsLayout.subtitle")}>
      <Select size="sm" className="w-full max-w-[240px]"
        value={layout}
        aria-label={t("sidebar.toolsLayout.chooseAria")}
        onChange={(event) => setSidebarToolsLayout(parseSidebarToolsLayout(event.target.value))}
      >
        {SIDEBAR_TOOLS_LAYOUTS.map((option) => (
          <option key={option} value={option}>{t(`sidebar.toolsLayout.${option}`)}</option>
        ))}
      </Select>
    </SettingRow>
  );
}
