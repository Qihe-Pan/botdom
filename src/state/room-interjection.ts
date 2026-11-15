import { ApiError } from "./api";
import type { Message } from "./store";
import { roomQueueSnapshot } from "./room-queue-recovery";

export interface RoomInterjectionTarget { botId: string; executionId: string }
export type RoomInterjectionStatus = "sending" | "dispatching" | "interrupted" | "delivered" | "queued" | "uncertain" | "stale" | "cancelled" | "unavailable";
export interface RoomInterjectionReceipt {
  queueId: string;
  target: RoomInterjectionTarget;
  status: RoomInterjectionStatus;
  blockedBy?: string;
}
export interface RoomInterjectionInput extends RoomInterjectionTarget { groupId: string; threadId: string; queueId: string }

export async function requestRoomInterjection(
  request: (path: string, init: RequestInit & { timeoutMs?: number }) => Promise<unknown>,
  input: RoomInterjectionInput,
): Promise<{ receipt: RoomInterjectionReceipt; messages?: Message[]; queueIds?: string[] }> {
  const { groupId, threadId, queueId, botId, executionId } = input;
  const receipt = (status: RoomInterjectionStatus, blockedBy?: string): RoomInterjectionReceipt => ({ queueId, target: { botId, executionId }, status, ...(blockedBy ? { blockedBy } : {}) });
  try {
    const answer = await request(`/api/groups/${groupId}/queue/${queueId}/steer`, {
      method: "POST", body: JSON.stringify({ threadId, botId, executionId }), timeoutMs: 15_000,
    });
    const body = answer as Record<string, unknown> | null;
    if (body?.queued === true && body.threadId === threadId) return { receipt: receipt("queued", typeof body.blockedBy === "string" ? body.blockedBy : undefined) };
    if (body?.queueReceipt) {
      try {
        const item = roomQueueSnapshot({ groupId, threadId, items: [body.queueReceipt] }, groupId, threadId).items[0]!;
        if (item.queueId !== queueId || item.state === "pending") return { receipt: receipt("uncertain") };
        const target = { botId: item.botId ?? "", executionId: item.executionId ?? "" };
        const settled = { queueId, target, status: item.state };
        return { receipt: settled, ...(["delivered", "cancelled", "interrupted"].includes(item.state) ? { queueIds: [queueId] } : {}) };
      } catch { return { receipt: receipt("uncertain") }; }
    }
    const queueIds = body?.queueIds;
    const messages = body?.messages;
    if (body?.steered === true && body.delivery === "uncertain" && body.threadId === threadId && body.botId === botId && body.executionId === executionId &&
      Array.isArray(queueIds) && new Set(queueIds).size === queueIds.length && queueIds.includes(queueId) && queueIds.every(id => typeof id === "string") &&
      Array.isArray(messages) && messages.length === 0) {
      return { receipt: receipt("uncertain"), queueIds };
    }
    if (body?.steered === true && body.threadId === threadId && body.botId === botId && body.executionId === executionId &&
      Array.isArray(queueIds) && new Set(queueIds).size === queueIds.length && queueIds.includes(queueId) && queueIds.every(id => typeof id === "string") &&
      Array.isArray(messages) && messages.length === queueIds.length && messages.every(message =>
        message && typeof message.id === "string" && message.role === "user" && queueIds.includes(message.queueId)) && new Set(messages.map(message => message.queueId)).size === queueIds.length) {
      return { receipt: receipt(body.delivery === "delivered" ? "delivered" : "uncertain"), messages, queueIds };
    }
    return { receipt: receipt("uncertain") };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.body?.code === "room_steer_target_stale" || error.body?.code === "room_steer_target_required") return { receipt: receipt("stale") };
      if (error.body?.code === "room_queue_uncertain") return { receipt: receipt("uncertain") };
      if (error.status >= 400 && error.status < 500) return { receipt: receipt("unavailable") };
    }
    return { receipt: receipt("uncertain") };
  }
}
