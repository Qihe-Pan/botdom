import type { BotRoomsResponse } from "../../shared/bot-rooms";
import type { WireMessage } from "../../shared/wire";
import { api } from "./api";
import type { GroupModelChangesRequest, GroupModelChangesResponse } from "../../shared/group-models";
import type { CreateGroupWithEmployeesRequest, CreateGroupWithEmployeesResponse } from "../../shared/group-create";

export function fetchBotRooms(botId: string): Promise<BotRoomsResponse> {
  return api(`/api/bots/${encodeURIComponent(botId)}/rooms`);
}

export function changeGroupModels(groupId: string, request: GroupModelChangesRequest): Promise<GroupModelChangesResponse> {
  return api(`/api/groups/${encodeURIComponent(groupId)}/member-models`, { method: "PATCH", body: JSON.stringify(request) });
}

export function createGroupWithEmployees(request: CreateGroupWithEmployeesRequest): Promise<CreateGroupWithEmployeesResponse> {
  return api("/api/groups/with-employees", { method: "POST", body: JSON.stringify(request) });
}


export function fetchRoomMessages(threadId: string, options: { limit?: number; before?: string } = {}): Promise<{ messages: WireMessage[]; hasMore?: boolean; activeLeafId: string | null }> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (options.before) query.set("before", options.before);
  const suffix = query.size ? `?${query}` : "";
  return api(`/api/threads/${encodeURIComponent(threadId)}/messages${suffix}`);
}
