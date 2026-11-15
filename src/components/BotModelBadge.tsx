import type { Bot, InstanceInfo } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { InstanceProviderMark } from "./ProviderIcons";

export function botModel(bot: Pick<Bot, "modelSelection">, instances: InstanceInfo[]): { instance: InstanceInfo; label: string } | null {
  const instance = instances.find((item) => item.instanceId === bot.modelSelection.instanceId);
  if (!instance) return null;
  const id = bot.modelSelection.model || instance.models?.default || "";
  const label = instance.models?.options?.find((option) => option.id === id)?.label ?? id;
  return { instance, label: label || instance.displayName };
}

// An engine such as Cursor runs other makers' models. The mark on a bot's face says whose model answers, so a
// DeepSeek model shows the DeepSeek whale whichever engine carries it.
const MODEL_BRANDS: ReadonlyArray<[RegExp, string]> = [[/deepseek/i, "deepseekAgent"], [/claude/i, "claudeAgent"], [/kimi|moonshot/i, "kimiAgent"], [/qwen/i, "qwenAgent"]];

export function modelMarkInstance(bot: Pick<Bot, "modelSelection">, model: { instance: InstanceInfo; label: string }): Pick<InstanceInfo, "driverKind" | "icon"> {
  const text = `${bot.modelSelection.model ?? ""} ${model.label}`;
  const brand = MODEL_BRANDS.find(([pattern]) => pattern.test(text))?.[1];
  return brand && brand !== model.instance.driverKind ? { driverKind: brand } : model.instance;
}

export function botTooltip(bot: Pick<Bot, "name" | "title" | "chiefOfStaff" | "modelSelection">, instances: InstanceInfo[]): string {
  const model = botModel(bot, instances);
  return [
    bot.name,
    bot.title.trim(),
    bot.chiefOfStaff ? t("sidebar.bot.chiefOfStaff") : "",
    model ? t("sidebar.bot.modelBadge", { model: model.label, engine: model.instance.displayName }) : "",
  ].filter(Boolean).join(" · ");
}

export function BotModelBadge({ bot, instances, avatarSize }: {
  bot: Pick<Bot, "modelSelection">;
  instances: InstanceInfo[];
  avatarSize: number;
}) {
  const model = botModel(bot, instances);
  if (!model) return null;
  const size = Math.max(14, Math.round(avatarSize * 0.4));
  const description = t("sidebar.bot.modelBadge", { model: model.label, engine: model.instance.displayName });
  return (
    <span data-testid="model-badge" role="img" aria-label={description} title={model.label}
      className="absolute -bottom-0.5 -left-0.5 flex items-center justify-center rounded-full border-2 border-panel bg-panel"
      style={{ width: size, height: size }}>
      <InstanceProviderMark instance={modelMarkInstance(bot, model)} size={size - 4} subtle />
    </span>
  );
}

/** Simple mode's faded engine mark. It has no title of its own, so hovering it still shows the row's tooltip with the model and engine. */
export function BotEngineMark({ bot, instances, className }: { bot: Pick<Bot, "modelSelection">; instances: InstanceInfo[]; className?: string }) {
  const model = botModel(bot, instances);
  if (!model) return null;
  return (
    <span data-testid="model-badge" role="img" aria-label={t("sidebar.bot.modelBadge", { model: model.label, engine: model.instance.displayName })}
      className={cn("flex shrink-0", className)}>
      <InstanceProviderMark instance={modelMarkInstance(bot, model)} size={14} subtle />
    </span>
  );
}
