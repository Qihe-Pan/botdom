import type { GroupTask, WireGroup } from "../../shared/wire";
import { api } from "./api";

function conversationPath(groupId: string, threadId: string): string {
  return `/api/groups/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(threadId)}`;
}

export function renameGroupConversation(groupId: string, threadId: string, title: string): Promise<{ task: GroupTask }> {
  return api(conversationPath(groupId, threadId), { method: "PATCH", body: JSON.stringify({ title }) });
}

export function archiveGroupConversation(groupId: string, threadId: string, archivedAt: number | null): Promise<{ task: GroupTask }> {
  return api(conversationPath(groupId, threadId), { method: "PATCH", body: JSON.stringify({ archivedAt }) });
}

export function deleteGroupConversation(groupId: string, threadId: string): Promise<{ group: WireGroup }> {
  return api(conversationPath(groupId, threadId), { method: "DELETE" });
}
