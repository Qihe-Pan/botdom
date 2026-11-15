// Follow-ups sent while a channel works stay off the transcript until it settles, so the current responder cannot appear
// to answer words it never saw.

import { newId } from "./contracts.ts";
import { chatFollowups, completeChatFollowups, findRoomSendReceipt, saveChatFollowup, settleChatFollowups } from "./message-db.ts";
import { drainCoalesceHead, DRAIN_COALESCE_MAX_ITEMS } from "./admission.ts";
import type { ResolvedSender } from "../shared/wire.ts";
import type { UsageTrigger } from "./usage-ledger.ts";

export interface ChannelQueueItem {
  id: string;
  text: string;
  replyToId?: string;
  sendId?: string;
  mode: "chat" | "goal";
  via?: "api";
  sender?: ResolvedSender;
  trigger?: UsageTrigger;
  reaction?: string;
  queuedAt: number;
  authorKey?: string;
}

interface ChannelQueueEntry {
  groupId: string;
  items: ChannelQueueItem[];
}

const queues = new Map<string, ChannelQueueEntry>();
const heldQueues = new Map<string, HeldChannelQueue>();

export function channelQueueHeld(threadId: string): boolean {
  return heldQueues.has(threadId);
}

export function restoreChannelMessages(): void {
  queues.clear();
  heldQueues.clear();
  for (const row of chatFollowups("channel")) {
    if (row.status !== "pending" || findRoomSendReceipt(row.ownerId, { queueId: row.id })?.receipt.state !== "pending") continue;
    const entry = queues.get(row.threadId) ?? { groupId: row.ownerId, items: [] };
    if (entry.groupId !== row.ownerId) throw new Error("queued task belongs to another channel");
    // a channel line is only ever stamped "api"; "call" belongs to 1:1 rows
    const { via, ...payload } = row.payload;
    entry.items.push({
      ...payload,
      ...(via === "api" ? { via } : {}),
      id: row.id,
      mode: row.payload.mode ?? "chat",
      queuedAt: row.payload.queuedAt ?? Date.now(),
    });
    queues.set(row.threadId, entry);
  }
}

export interface QueuedChannelMessage {
  id: string;
}

export function queueChannelMessage(
  groupId: string,
  threadId: string,
  text: string,
  options: {
    replyToId?: string;
    sendId?: string;
    mode?: "chat" | "goal";
    via?: "api";
    sender?: ResolvedSender;
    trigger?: UsageTrigger;
    reaction?: string;
    authorKey?: string;
  } = {},
): QueuedChannelMessage {
  const entry = queues.get(threadId) ?? { groupId, items: [] };
  if (entry.groupId !== groupId) throw new Error("queued task belongs to another channel");
  const item: ChannelQueueItem = {
    id: newId(),
    text,
    replyToId: options.replyToId,
    sendId: options.sendId,
    mode: options.mode ?? "chat",
    via: options.via,
    sender: options.sender,
    trigger: options.trigger,
    ...(options.reaction ? { reaction: options.reaction } : {}),
    queuedAt: Date.now(),
    ...(options.authorKey ? { authorKey: options.authorKey } : {}),
  };
  saveChatFollowup({ id: item.id, kind: "channel", ownerId: groupId, threadId, payload: item });
  entry.items.push(item);
  queues.set(threadId, entry);
  return { id: item.id };
}

export function queuedChannelMessage(
  groupId: string,
  threadId: string,
  sendId: string,
): ChannelQueueItem | null {
  const entry = heldQueues.get(threadId) ?? queues.get(threadId);
  if (!entry || entry.groupId !== groupId) return null;
  return entry.items.find((item) => item.sendId === sendId) ??
    queues.get(threadId)?.items.find((item) => item.sendId === sendId) ?? null;
}

/** A pending receipt is retryable only while its item is still in this room's queue or held tail. */
export function hasChannelMessage(groupId: string, threadId: string, queueId: string): boolean {
  return [heldQueues.get(threadId), queues.get(threadId)].some(entry =>
    entry?.groupId === groupId && entry.items.some(item => item.id === queueId));
}

export function cancelChannelMessage(groupId: string, queueId: string): boolean {
  for (const [threadId, entry] of queues) {
    if (entry.groupId !== groupId) continue;
    const items = entry.items.filter((item) => item.id !== queueId);
    if (items.length === entry.items.length) continue;
    settleChatFollowups([queueId], "cancelled");
    if (items.length === 0) queues.delete(threadId);
    else queues.set(threadId, { groupId, items });
    return true;
  }
  return false;
}

export function cancelChannelMessages(groupId: string, threadId: string): void {
  const pending = queues.get(threadId);
  const held = heldQueues.get(threadId);
  const items = [...(pending?.groupId === groupId ? pending.items : []), ...(held?.groupId === groupId ? held.items : [])];
  settleChatFollowups(items.map(item => item.id), "cancelled");
  if (pending?.groupId === groupId) queues.delete(threadId);
  if (held?.groupId === groupId) heldQueues.delete(threadId);
}

export interface HeldChannelQueue {
  groupId: string;
  threadId: string;
  items: ChannelQueueItem[];
}

/** The entry leaves first, so a room settling meanwhile can never also drain the same words. Only the head group can be
 * lifted, and the caller must either restore the held queue or settle its head group. */
export function holdChannelQueue(groupId: string, threadId: string, queueId: string): HeldChannelQueue | null {
  if (heldQueues.has(threadId)) return null;
  const entry = queues.get(threadId);
  if (!entry || entry.groupId !== groupId || entry.items[0]?.id !== queueId) return null;
  queues.delete(threadId);
  const held = { groupId, threadId, items: entry.items };
  heldQueues.set(threadId, held);
  return held;
}

/** Words queued while the hold was open keep their place behind the restored items. */
export function restoreHeldChannelQueue(held: HeldChannelQueue): void {
  if (heldQueues.get(held.threadId) !== held) return;
  const existing = queues.get(held.threadId);
  if (existing && existing.groupId !== held.groupId) throw new Error("queued task belongs to another channel");
  settleChatFollowups(headChannelGroup(held.items).map(item => item.id), "pending");
  queues.set(held.threadId, {
    groupId: held.groupId,
    items: existing ? [...held.items, ...existing.items] : held.items,
  });
  heldQueues.delete(held.threadId);
}

export function dispatchHeldChannelQueueHead(held: HeldChannelQueue, target?: { botId: string; executionId?: string }): void {
  if (heldQueues.get(held.threadId) !== held) throw new Error("channel queue hold is no longer active");
  const ids = headChannelGroup(held.items).map(item => item.id);
  settleChatFollowups(ids, "dispatching", target);
}

/** The queue is already lifted, so restore first, then let the error reach the request. */
export function resolveHeldReplyTarget<T>(
  held: HeldChannelQueue,
  resolve: (threadId: string, replyToId: string) => T,
): T | undefined {
  const head = held.items[0];
  if (!head?.replyToId) return undefined;
  try {
    return resolve(held.threadId, head.replyToId);
  } catch (error) {
    restoreHeldChannelQueue(held);
    throw error;
  }
}

/** A restart must not replay the steered words as a fresh follow-up. */
export function settleHeldChannelQueueHead(held: HeldChannelQueue): void {
  if (heldQueues.get(held.threadId) !== held) return;
  const head = headChannelGroup(held.items);
  const rest = held.items.slice(head.length);
  settleChatFollowups(head.map((item) => item.id), null);
  heldQueues.delete(held.threadId);
  if (rest.length === 0) return;
  const existing = queues.get(held.threadId);
  if (existing && existing.groupId !== held.groupId) throw new Error("queued task belongs to another channel");
  queues.set(held.threadId, {
    groupId: held.groupId,
    items: existing ? [...rest, ...existing.items] : rest,
  });
}

/** Removing first makes repeated settle notifications harmless. */
export function drainChannelMessages(
  isWorking: (groupId: string, threadId: string) => boolean,
  /** Resolve with the ids whose turn actually started to mark them delivered; any other settled id stays uncertain. */
  run: (input: { groupId: string; threadId: string; items: ChannelQueueItem[] }) => void | Promise<void | readonly string[]>,
  whileWorking?: (groupId: string, threadId: string, item: ChannelQueueItem) => boolean,
): void {
  for (const [threadId, entry] of queues) {
    if (heldQueues.has(threadId)) continue;
    const working = isWorking(entry.groupId, threadId);
    const index = working ? entry.items.findIndex(item => whileWorking?.(entry.groupId, threadId, item)) : 0;
    if (index < 0) continue;
    if (heldQueues.has(threadId) || queues.get(threadId) !== entry) continue;
    if (entry.items.length === 0) {
      queues.delete(threadId);
      continue;
    }
    const group = working ? [entry.items[index]!] : headChannelGroup(entry.items);
    const ids = group.map((item) => item.id);
    settleChatFollowups(ids, "dispatching");
    entry.items.splice(index, group.length);
    if (entry.items.length === 0) queues.delete(threadId);
    const running = run({ groupId: entry.groupId, threadId, items: group });
    void Promise.resolve(running).then(
      (started) => {
        const delivered = new Set(started ?? []);
        completeChatFollowups(ids.filter(id => delivered.has(id)));
        settleChatFollowups(ids.filter(id => !delivered.has(id)), null);
      },
      () => settleChatFollowups(ids, "interrupted"),
    ).catch((error) => console.warn("channel-queue: could not settle durable follow-up", error));
  }
}

export function headChannelGroup(items: readonly ChannelQueueItem[]): ChannelQueueItem[] {
  return drainCoalesceHead(items, coalesceIdentity, (item) => item.queuedAt, DRAIN_COALESCE_MAX_ITEMS);
}

/** An API send has no person behind it and never merges, nor does a goal; unattributed local sends are one identity. */
function coalesceIdentity(item: ChannelQueueItem): string {
  if (item.authorKey) return `${item.mode}:${item.via ?? "person"}:${item.authorKey}${item.mode !== "chat" || item.via ? `:${item.id}` : ""}`;
  if (item.via === "api") return `api:${item.id}`;
  if (item.mode !== "chat") return `mode:${item.mode}:${item.id}`;
  if (item.sender) return `person:${item.sender.id ?? item.sender.name}`;
  return "person:local";
}

export function queuedChannelSends(threadId: string): number {
  return queues.get(threadId)?.items.length ?? 0;
}

export const _queuedChannelCount = queuedChannelSends;
