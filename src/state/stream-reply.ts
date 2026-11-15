import { useSyncExternalStore } from "react";
import type { RuntimeEvent } from "../../shared/runtime-events";

export interface StreamReply { botId?: string; turnId?: string; itemId?: string; text: string; at: number; completed: boolean }
const replies = new Map<string, StreamReply>();
const listeners = new Map<string, Set<() => void>>();
const seen = new Set<string>();
const ended = new Map<string, string | undefined>();
const active = new Map<string, string | undefined>();
const retired = new Set<string>();
const MAX_TEXT = 256 * 1024;

function retire(threadId: string, turnId: string | undefined) {
  if (!turnId) return;
  retired.add(`${threadId}:${turnId}`);
  if (retired.size > 1000) retired.delete(retired.values().next().value!);
}

function publish(threadId: string) { for (const listener of listeners.get(threadId) ?? []) listener(); }
function clear(threadId: string) { if (replies.delete(threadId)) publish(threadId); }

export function noteStreamReply(event: RuntimeEvent): void {
  if (seen.has(event.eventId)) return;
  seen.add(event.eventId);
  if (seen.size > 8192) seen.delete(seen.values().next().value!);
  if (event.executionThreadId && event.botId) event = { ...event, threadId: streamKey(event.threadId, event.botId) };
  const current = replies.get(event.threadId);
  if (event.turnId && retired.has(`${event.threadId}:${event.turnId}`)) return;
  if (event.type === "turn.started") {
    const previous = active.get(event.threadId);
    if (previous && previous !== event.turnId) retire(event.threadId, previous);
    active.set(event.threadId, event.turnId);
    if (active.size > 100) active.delete(active.keys().next().value!);
    ended.delete(event.threadId);
    if (!current || current.turnId !== event.turnId) clear(event.threadId);
    return;
  }
  if (["turn.completed", "cap.exhausted", "session.exited"].includes(event.type)) {
    retire(event.threadId, event.turnId);
    if (active.get(event.threadId) && event.turnId && active.get(event.threadId) !== event.turnId) return;
    ended.set(event.threadId, event.turnId);
    if (ended.size > 100) ended.delete(ended.keys().next().value!);
    clear(event.threadId); return;
  }
  if (active.get(event.threadId) && event.turnId && active.get(event.threadId) !== event.turnId) return;
  if (ended.has(event.threadId) && ended.get(event.threadId) === event.turnId) return;
  if (event.type === "content.delta" && event.streamKind === "assistant_text") {
    if (!active.has(event.threadId)) active.set(event.threadId, event.turnId);
    const continuing = current && current.turnId === event.turnId && current.itemId === event.itemId && !current.completed;
    replies.set(event.threadId, { botId: event.botId, turnId: event.turnId, itemId: event.itemId, text: ((continuing ? current.text : "") + event.delta).slice(0, MAX_TEXT), at: continuing ? current.at : Date.parse(event.createdAt), completed: false });
    if (replies.size > 50) clear(replies.keys().next().value!);
    publish(event.threadId);
  } else if (event.type === "item.completed" && event.itemType === "assistant_text" && current && current.turnId === event.turnId && (!current.itemId || !event.itemId || current.itemId === event.itemId)) {
    replies.set(event.threadId, { ...current, text: event.text.slice(0, MAX_TEXT), completed: true });
    publish(event.threadId);
  }
}

const streamKey = (threadId: string, botId: string) => `${threadId}::member::${botId}`;

export function settleStreamReply(threadId: string, message: { role: string; kind: string; turnId?: string; text?: string }) {
  for (const [key, current] of replies) {
    if (key !== threadId && !key.startsWith(`${threadId}::member::`)) continue;
    if (current.turnId === message.turnId && message.role === "bot" && message.kind === "text" && (message.text === current.text || current.completed)) clear(key);
  }
}
export function resetStreamReplies() { for (const id of replies.keys()) clear(id); ended.clear(); active.clear(); retired.clear(); seen.clear(); }
export const streamReply = (threadId: string, botId?: string) => {
  if (botId) {
    const member = replies.get(streamKey(threadId, botId));
    if (member) return member;
    const legacy = replies.get(threadId);
    return legacy && (!legacy.botId || legacy.botId === botId) ? legacy : null;
  }
  return replies.get(threadId) ?? null;
};
export function useStreamReply(threadId: string, botId?: string) {
  return useSyncExternalStore(listener => {
    const keys = botId ? [threadId, streamKey(threadId, botId)] : [threadId];
    for (const key of keys) {
      let set = listeners.get(key);
      if (!set) listeners.set(key, set = new Set());
      set.add(listener);
    }
    return () => { for (const key of keys) { const set = listeners.get(key); set?.delete(listener); if (!set?.size) listeners.delete(key); } };
  }, () => streamReply(threadId, botId), () => null);
}
