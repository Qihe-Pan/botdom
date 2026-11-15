import type { Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { AvatarColors, AvatarShapes } from "./AvatarAppearancePicker";
import { BotAvatar } from "./Avatar";
import { useAvatarImage, type AvatarPatch } from "./avatar-editing";

export function EmployeeAvatarPicker({ bot, onPatch, size = 64, preview = true, compact = false }: { bot: Bot; onPatch: (patch: AvatarPatch) => void; size?: number; preview?: boolean; compact?: boolean }) {
  const { busy, error } = useAvatarImage(bot, onPatch);
  const hasImage = Boolean(bot.avatarUrl) && bot.avatarCrop !== "mascot";
  const useMascot = (patch: AvatarPatch) => onPatch({ avatarUrl: null, avatarCrop: "mascot", ...patch });
  return <section className={compact ? "space-y-2" : "space-y-3"} aria-label={t("botIdentity.avatar")} data-employee-avatar-picker>
    <div className="flex items-center gap-4">
      {preview && <span className="relative shrink-0 rounded-2xl"><BotAvatar bot={hasImage ? { ...bot, avatarUrl: null } : bot} size={size} animated={false} /></span>}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[12px] text-ink-secondary">{t("botIdentity.color")}</p>
        <AvatarColors bot={bot} busy={busy} hasImage={hasImage} onColor={color => useMascot({ color })} />

      </div>
    </div>
    <AvatarShapes bot={bot} busy={busy} hasImage={hasImage} compact={compact} onBody={mascotBody => useMascot({ mascotBody })} />
    {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
  </section>;
}
