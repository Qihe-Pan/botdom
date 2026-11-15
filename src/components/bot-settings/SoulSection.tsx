import type { Bot } from "@/state/store";
import { SoulField } from "../SoulField";
import { ProposalStatus } from "./ProposalStatus";
import type { BotPatch } from "./useBotSettingsDerived";
import { t } from "@/lib/i18n";

export function SoulSection({ bot, patch }: { bot: Bot; patch: (patch: BotPatch) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ProposalStatus bot={bot} kind="chief" />
      <SoulField bot={bot} onPatch={patch} simple={{ label: t("p0.bot.soulLabel"), placeholder: t("p0.bot.soulPlaceholder") }} />
    </div>
  );
}
