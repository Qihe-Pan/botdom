import { useId, useState } from "react";
import { isRoomSupervisor } from "../../shared/room-supervisor";
import { api, useStore, type Bot } from "@/state/store";
import { useRoomMembership, roomMembershipBusy } from "@/lib/room-membership";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Check } from "lucide-react";
import { ChoiceSelect } from "./ChoiceSelect";

export const choicePill = "rounded-full border px-3 py-1.5 text-[13px] font-normal transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";

export function DepartmentChoice({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { state } = useStore();
  const labelId = useId();
  const names = [...new Set([...(state.sections ?? []), ...state.bots.filter(bot => !bot.hidden && !isRoomSupervisor(bot, state.groups)).map(bot => bot.section ?? ""), value])].filter(Boolean);
  return <div className="space-y-1.5"><div id={labelId} className="text-[13px] text-ink-secondary">{t("p0.bot.department")}</div>
    <ChoiceSelect value={value} aria-labelledby={labelId} onChange={event => onChange(event.target.value)}>
      <option value="">{t("p0.bot.noDepartment")}</option>{names.map(name => <option key={name}>{name}</option>)}
    </ChoiceSelect>
  </div>;
}

export function BotOrganizationFields({ bot }: { bot: Bot }) {
  const { state, dispatch } = useStore();
  const [savingDepartment, setSavingDepartment] = useState(false);
  const changeDepartment = async (section: string) => {
    if (savingDepartment) return;
    setSavingDepartment(true);
    try {
      const result = await api<{ bot: Bot }>(`/api/bots/${encodeURIComponent(bot.id)}`, { method: "PATCH", body: JSON.stringify({ section }) });
      dispatch({ type: "botPatched", bot: result.bot });
    } catch (cause) { dispatch({ type: "error", message: String(cause) }); }
    finally { setSavingDepartment(false); }
  };
  const membership = useRoomMembership();
  if (isRoomSupervisor(bot, state.groups)) return null;
  const groups = state.groups.filter(group => !group.dm);
  return <div className="space-y-4">
    <fieldset disabled={savingDepartment || !membership.allowed}><DepartmentChoice value={bot.section ?? ""} onChange={section => void changeDepartment(section)} /></fieldset>
    <fieldset disabled={!membership.allowed || membership.saving} className="space-y-1.5"><legend className="mb-1.5 text-[13px] text-ink-secondary">{t("p0.bot.groups")}</legend>
      <div className="flex flex-wrap gap-1.5">{groups.map(group => {
        const joined = group.memberIds.includes(bot.id);
        return <button type="button" key={group.id} aria-pressed={joined} disabled={roomMembershipBusy(group)}
          className={cn(choicePill, "inline-flex items-center gap-1", joined ? "border-accent/45 bg-accent/[0.08] text-ink" : "border-hairline/60 bg-app text-ink-secondary hover:border-ink/30 hover:text-ink")}
          onClick={() => void membership.change(group, bot.id, !joined)}>{joined && <Check size={13} className="text-accent" aria-hidden="true" />}{group.name}</button>;
      })}</div>
      {!groups.length && <p className="text-[12px] text-ink-secondary">{t("p0.bot.noGroups")}</p>}
    </fieldset>
  </div>;
}
