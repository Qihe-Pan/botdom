import { ArrowUpRight } from "lucide-react";
import { appendComposerDraft } from "@/lib/drafts";
import { api, useStore, type Bot } from "@/state/store";
import { useAdvancedMode } from "@/lib/interface-mode";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";
import { RenameTitle } from "./RenameTitle";

/** A chat with no messages yet: the bot, its name (renamable in Advanced) and what it is for. */
export function EmptyChat({ bot, onBegin }: { bot: Bot; onBegin?: () => void }) {
  const { dispatch } = useStore();
  const advanced = useAdvancedMode();
  const intro = bot.title?.trim() || bot.description?.trim().split("\n")[0]?.trim() || t("chat.emptyInvitation");
  const begin = (text?: string) => {
    if (text) appendComposerDraft(`bot:${bot.id}:${bot.threadId}`, text);
    onBegin?.();
  };
  return (
    <div data-botdom-empty-chat className="botdom-empty-chat flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <button type="button" onClick={() => begin()} aria-label={t("chat.emptyBegin")} className="botdom-empty-avatar mb-1 flex size-20 items-center justify-center rounded-[26px]">
        <BotAvatar bot={bot} state="idle" size={56} motion="none" motionKey={0} />
      </button>
      {!advanced ? <div className="text-[18px] font-medium text-ink">{bot.name}</div> : <RenameTitle
        value={bot.name}
        onCommit={(name) => {
          if (window.ogb?.remoteClient?.active) {
            void api(`/api/bots/${bot.id}/profile`, { method: "PATCH", body: JSON.stringify({ name }) })
              .then(({ bot: updated }) => dispatch({ type: "botPatched", bot: updated }))
              .catch((cause) => dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }));
          } else {
            dispatch({ type: "updateBot", botId: bot.id, patch: { name } });
          }
        }}
        className="text-[18px] font-medium text-ink"
        inputClassName="rounded bg-inset px-1.5 py-0.5 text-center text-[18px] font-medium"
      />}
      {/* The role reads as an introduction; a description is often the opening of the bot's instructions, so it stays short. */}
      <div title={intro.length > 60 ? intro : undefined} className="line-clamp-2 max-w-[320px] text-balance text-[13px] leading-relaxed text-ink-secondary">
        {intro}
      </div>
      <div className="mt-2 flex max-w-full flex-wrap justify-center gap-2">
        {(["chat.emptyPlan", "chat.emptyExplore"] as const).map((key) => (
          <button key={key} type="button" onClick={() => begin(t(key))} className="botdom-prompt-chip botdom-interactive flex items-center gap-2 rounded-xl border border-hairline/50 px-3 py-2 text-[12px] text-ink-secondary">
            {t(key)}<ArrowUpRight size={13} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
