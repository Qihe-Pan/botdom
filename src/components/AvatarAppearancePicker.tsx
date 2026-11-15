import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { MAUS_COLOR_LABEL } from "@/lib/mascot";
import { PERSON_AVATAR_COLORS, type PersonMascot } from "../../shared/person-avatar";
import { MASCOT_BODY_IDS, type MascotBodyId } from "../../shared/mascot-bodies";
import { BotAvatar, type BotAvatarProps } from "./Avatar";

type AppearanceProps = { bot: BotAvatarProps["bot"]; busy?: boolean; hasImage: boolean };

/** Botdom's faces come in seven tones; red draws the pink face, so offering both shows the same picture twice. */
const PICKER_COLORS = PERSON_AVATAR_COLORS.filter(color => color !== "red");

/** A bot set to red shows the pink face, so the pink swatch is the one that reads as chosen. */
const shownColor = (color: string) => (color === "red" ? "pink" : color);

export function AvatarColors({ bot, busy, hasImage, onColor }: AppearanceProps & { onColor: (color: PersonMascot["color"]) => void }) {
  return <div role="group" aria-label={t("botIdentity.color")} className="grid grid-cols-[repeat(auto-fit,minmax(2.25rem,1fr))] justify-items-center gap-1">
    {PICKER_COLORS.map(color => <button key={color} type="button" aria-pressed={!hasImage && shownColor(bot.color) === color} disabled={busy}
      aria-label={t(MAUS_COLOR_LABEL[color])} title={t(MAUS_COLOR_LABEL[color])} onClick={() => onColor(color)}
      className={cn("botdom-press flex size-8 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus", !hasImage && shownColor(bot.color) === color ? "botdom-pop bg-card shadow-sm ring-[1.5px] ring-ink/45" : "hover:bg-control/60")}>
      <BotAvatar bot={{ ...bot, color, avatarUrl: null }} size={24} animated={false} />
    </button>)}
  </div>;
}

export function AvatarShapes({ bot, busy, hasImage, onBody, compact = false }: AppearanceProps & { onBody: (body: MascotBodyId) => void; compact?: boolean }) {
  return <div>
    <p className="mb-2 text-[12px] text-ink-secondary">{t("botPanel.avatar.shape")}</p>
    <div role="group" aria-label={t("botPanel.avatar.shape")} className={compact ? "grid grid-cols-[repeat(auto-fit,minmax(2.25rem,1fr))] justify-items-center gap-0.5" : "grid grid-cols-5 gap-1.5"}>
      {MASCOT_BODY_IDS.map(body => <button key={body} type="button" disabled={busy} data-avatar-body={body}
        aria-pressed={!hasImage && (bot.mascotBody ?? "cursor") === body} aria-label={t(`avatar.body.${body}`)} title={t(`avatar.body.${body}`)}
        onClick={() => onBody(body)}
        className={cn("botdom-press flex min-w-0 flex-col items-center gap-1 rounded-xl text-[11px] text-ink-secondary focus-visible:outline-none", compact ? "size-8 justify-center" : "px-1 py-2", " focus-visible:ring-2 focus-visible:ring-focus",
          !hasImage && (bot.mascotBody ?? "cursor") === body ? "botdom-pop bg-card text-ink shadow-sm ring-[1.5px] ring-ink/45" : "hover:bg-control/60")}>
        <BotAvatar bot={{ ...bot, mascotBody: body, avatarUrl: null }} size={28} animated={false} />
        {!compact && <span>{t(`avatar.body.${body}`)}</span>}
      </button>)}
    </div>
  </div>;
}
