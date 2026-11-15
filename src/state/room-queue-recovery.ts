import type { RoomMessageQueueSnapshot, RoomQueuedMessage } from "../../shared/room-message-queue";

type SendReference = { queueId?: string; sendId?: string; text?: string };
const prefix = "botdom.room-queue.v1:";
const states = new Set(["pending", "dispatching", "delivered", "uncertain", "cancelled", "interrupted"]);
export function roomQueueSnapshot(value: unknown, groupId: string, threadId: string): RoomMessageQueueSnapshot {
  const snapshot = value as RoomMessageQueueSnapshot | null;
  if (!snapshot || snapshot.groupId !== groupId || snapshot.threadId !== threadId || !Array.isArray(snapshot.items) ||
    snapshot.items.some(item => !item || item.groupId !== groupId || item.threadId !== threadId || typeof item.queueId !== "string" || !item.queueId ||
      typeof item.text !== "string" || !states.has(item.state) || !Number.isFinite(item.updatedAt) || !Number.isFinite(item.queuedAt) ||
      !["chat", "goal"].includes(item.mode) || [item.sendId, item.botId, item.executionId, item.messageId].some(id => id !== undefined && typeof id !== "string")) ||
    new Set(snapshot.items.map(item => item.queueId)).size !== snapshot.items.length) throw new Error("Invalid room queue snapshot");
  return snapshot;
}
export function roomSendReferences(groupId: string, threadId: string): SendReference[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(prefix + groupId + ":" + threadId) ?? "[]");
    return Array.isArray(value) ? value.filter(ref => ref && (typeof ref.queueId === "string" || typeof ref.sendId === "string") && [ref.queueId, ref.sendId, ref.text].every(value => value === undefined || typeof value === "string")) : [];
  } catch { return []; }
}
export function rememberRoomSend(groupId: string, threadId: string, ref: SendReference) {
  const previous = roomSendReferences(groupId, threadId);
  const same = previous.find(old => (ref.queueId && old.queueId === ref.queueId) || (ref.sendId && old.sendId === ref.sendId));
  const refs = previous.filter(old => !(ref.queueId && old.queueId === ref.queueId) && !(ref.sendId && old.sendId === ref.sendId));
  try { localStorage.setItem(prefix + groupId + ":" + threadId, JSON.stringify([...refs, { ...same, ...ref, sendId: ref.sendId ?? same?.sendId, text: ref.text ?? same?.text }].slice(-64))); } catch {}
}
export async function recoverRoomQueue(
  request: (path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<unknown>,
  groupId: string, threadId: string, refs: SendReference[] = [], signal?: AbortSignal,
): Promise<RoomMessageQueueSnapshot> {
  const path = `/api/groups/${encodeURIComponent(groupId)}/queue?threadId=${encodeURIComponent(threadId)}`;
  const init = { signal, timeoutMs: 15_000 };
  const snapshot = roomQueueSnapshot(await request(path, init), groupId, threadId);
  const known = [...snapshot.items];
  const queries = [...new Set(refs.filter(ref => !known.some(item => ref.queueId ? item.queueId === ref.queueId : item.sendId === ref.sendId))
    .map(ref => ref.queueId ? `queueId=${encodeURIComponent(ref.queueId)}` : `sendId=${encodeURIComponent(ref.sendId!)}`))];
  const results = await Promise.allSettled(queries.map(async query => {
    const exact = roomQueueSnapshot(await request(`${path}&${query}`, init), groupId, threadId);
    const params = new URLSearchParams(query);
    return exact.items.filter(item => params.has("queueId") ? item.queueId === params.get("queueId") : item.sendId === params.get("sendId"));
  }));
  if (signal?.aborted) throw new Error("Room queue recovery cancelled");
  for (const result of results) {
    if (result.status === "fulfilled") for (const item of result.value) if (!known.some(old => old.queueId === item.queueId)) known.push(item);
  }
  return { ...snapshot, items: known };
}
export function mergeRoomQueueFacts(previous: RoomQueuedMessage[], next: RoomQueuedMessage[]): RoomQueuedMessage[] {
  const items = new Map(previous.map(item => [item.queueId, item]));
  for (const item of next) {
    const old = items.get(item.queueId);
    if (old && (old.updatedAt > item.updatedAt || old.state === "delivered" ||
      (old.state === "uncertain" && item.state === "pending") ||
      (["cancelled", "interrupted"].includes(old.state) && item.state !== "delivered") ||
      (old.state !== "pending" && item.state === "pending" && old.updatedAt >= item.updatedAt))) continue;
    items.set(item.queueId, item);
  }
  return [...items.values()];
}
