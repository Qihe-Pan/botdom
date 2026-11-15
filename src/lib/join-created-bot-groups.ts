import { isRoomSupervisor } from "../../shared/room-supervisor";
import { api, type Action, type Bot, type Group } from "@/state/store";
import { roomMembershipBusy } from "./room-membership";
import { t } from "./i18n";

export async function joinCreatedBotGroups(bot: Bot, groupIds: readonly string[], dispatch: (action: Action) => void, request: typeof api = api): Promise<string[]> {
  if (!groupIds.length) return [];
  const warnings: string[] = [];
  try {
    const { groups } = await request<{ groups: Group[] }>("/api/bots");
    if (isRoomSupervisor(bot, groups)) throw new Error(t("p0.bot.employeeOnly"));
    for (const id of new Set(groupIds)) {
      const group = groups.find(candidate => candidate.id === id && !candidate.dm);
      try {
        if (!group) throw new Error(t("p0.bot.groupUnavailable"));
        if (group.memberIds.includes(bot.id)) continue;
        if (roomMembershipBusy(group)) throw new Error(t("botdom.members.busy"));
        const result = await request<{ group: Group }>(`/api/groups/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ memberIds: [...group.memberIds, bot.id] }) });
        dispatch({ type: "groupPatched", group: result.group });
      } catch (cause) {
        warnings.push(t("p0.bot.joinFailed", { group: group?.name ?? id, error: String(cause) }));
      }
    }
  } catch (cause) { warnings.push(t("p0.bot.joinFailed", { group: groupIds.join(", "), error: String(cause) })); }
  return warnings;
}
