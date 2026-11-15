import { isRoomSupervisor } from "../../shared/room-supervisor";
import { useRef, useState, type DragEvent } from "react";
import { api, useStore, type Group } from "@/state/store";
import { t } from "./i18n";
import { useOwnerOrAdmin } from "./use-owner-or-admin";
import { roomThreadWorking } from "./room-threads";

export const EMPLOYEE_DRAG_TYPE = "application/x-botdom-employee";
export const ROOM_MEMBER_DRAG_TYPE = "application/x-botdom-room-member";

export function roomLeadId(group: Pick<Group, "defaultResponder" | "supervisorId">): string | undefined {
  if (group.supervisorId) return group.supervisorId;
  const responder = group.defaultResponder;
  return responder.kind === "member" ? responder.botId : responder.kind === "auto" ? responder.fallbackBotId : undefined;
}

export function roomMembershipBusy(group: Group): boolean {
  return roomThreadWorking(group, group.threadId) || Boolean(group.tasks?.some((task) => task.working || task.busyBotId));
}

export function roomMemberIdsAfter(group: Group, botId: string, joined: boolean): string[] {
  if (joined) return group.memberIds.includes(botId) ? group.memberIds : [...group.memberIds, botId];
  if (botId === roomLeadId(group)) throw new Error(t("botdom.members.keepLead"));
  if (group.memberIds.length <= 1) throw new Error(t("botdom.members.keepOne"));
  return group.memberIds.filter((id) => id !== botId);
}

export function employeeDrag(event: DragEvent<HTMLElement>, botId: string): void {
  event.dataTransfer.setData(EMPLOYEE_DRAG_TYPE, botId);
}

export function memberDragPreview(event: DragEvent<HTMLElement>, name: string, source: Element = event.currentTarget): void {
  const preview = document.createElement("div");
  preview.className = "botdom-drag-preview";
  preview.inert = true;
  preview.setAttribute("aria-hidden", "true");
  const face = source.querySelector<HTMLElement>(".botdom-face")?.cloneNode(true) as HTMLElement | undefined;
  if (face) { face.style.width = "24px"; face.style.height = "24px"; preview.append(face); }
  const title = document.createElement("span");
  title.textContent = name;
  preview.append(title);
  document.body.append(preview);
  event.dataTransfer.setDragImage(preview, 12, 16);
  requestAnimationFrame(() => preview.remove());
}

export function useRoomMembership() {
  const { state, dispatch } = useStore();
  const owner = useOwnerOrAdmin();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const allowed = owner !== false && (typeof window === "undefined" || window.ogb?.remoteClient?.active !== true);
  const change = async (shown: Group, botId: string, joined: boolean): Promise<boolean> => {
    if (!allowed || pending.current) return false;
    const group = state.groups.find((candidate) => candidate.id === shown.id) ?? shown;
    try {
      if (group.dm) return false;
      if (roomMembershipBusy(group)) throw new Error(t("botdom.members.busy"));
      const bot = state.bots.find((candidate) => candidate.id === botId);
      if (!bot || (joined && (bot.hidden || isRoomSupervisor(bot, state.groups)))) return false;
      const memberIds = roomMemberIdsAfter(group, botId, joined);
      if (memberIds.length === group.memberIds.length && memberIds.every((id, index) => id === group.memberIds[index])) return true;
      pending.current = true;
      setSaving(true);
      const response = await api<{ group: Group }>(`/api/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ memberIds }) });
      dispatch({ type: "groupPatched", group: response.group });
      return true;
    } catch (cause) {
      dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return { allowed, saving, change };
}
