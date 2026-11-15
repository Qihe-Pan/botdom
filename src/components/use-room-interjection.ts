import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Action, Bot, Group } from "@/state/store";
import type { RoomInterjectionReceipt, RoomInterjectionTarget } from "@/state/room-interjection";
import { roomExecutionTodo } from "@/lib/room-threads";
import type { RoomMessageQueueSnapshot } from "../../shared/room-message-queue";
import { api } from "@/state/api";
import { recoverRoomQueue, rememberRoomSend, roomSendReferences } from "@/state/room-queue-recovery";
import { replySnippet } from "@/lib/replies";
import { optimisticMessageId } from "@/state/optimistic-send";

export interface SavedReceipt extends RoomInterjectionReceipt { name: string; label?: string; sendId?: string; awaitingSnapshot?: boolean }
const receipts = new Map<string, SavedReceipt[]>();
const listeners = new Set<() => void>();
const inFlight = new Set<string>();
const empty: SavedReceipt[] = [];
const prefix = "botdom.room-interjection.v1:";
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const targetKey = (target: RoomInterjectionTarget) => `${target.botId}:${target.executionId}`;

function read(scope: string): SavedReceipt[] {
  if (!scope) return empty;
  const cached = receipts.get(scope);
  if (cached) return cached;
  let saved: SavedReceipt[] = [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(prefix + scope) ?? "[]");
    if (Array.isArray(value)) saved = value.filter((row): row is SavedReceipt => row && typeof row.queueId === "string" && typeof row.name === "string" &&
      typeof row.target?.botId === "string" && typeof row.target?.executionId === "string" && (row.label === undefined || typeof row.label === "string") &&
      (row.awaitingSnapshot === undefined || typeof row.awaitingSnapshot === "boolean") && (row.sendId === undefined || typeof row.sendId === "string") &&
      ["sending", "delivered", "queued", "dispatching", "interrupted", "uncertain", "stale", "cancelled", "unavailable"].includes(row.status))
      .slice(-32).map(row => row.status === "sending" ? { ...row, status: "uncertain", awaitingSnapshot: false } : row.status === "queued" || row.status === "stale" ? { ...row, status: "uncertain", awaitingSnapshot: true } : row);
  } catch {}
  receipts.set(scope, saved);
  return saved;
}
function save(scope: string, receipt: SavedReceipt, options?: { confirmedPendingAfterDispatch?: boolean }) {
  const previous = read(scope).find(row => row.queueId === receipt.queueId);
  if (previous?.status === "delivered" && receipt.status !== "delivered") return;
  const tentative = ["sending", "queued", "stale", "unavailable"].includes(receipt.status);
  if (tentative && ((previous?.status === "dispatching" && !(receipt.status === "queued" && options?.confirmedPendingAfterDispatch)) ||
    (previous?.status === "uncertain" && !previous.awaitingSnapshot))) return;
  if (previous?.status === "uncertain" && !previous.awaitingSnapshot && receipt.status === "dispatching") return;
  if ((previous?.status === "cancelled" || previous?.status === "interrupted") &&
    receipt.status !== previous.status && receipt.status !== "delivered") return;
  if (previous && previous.status === receipt.status && ["delivered", "dispatching", "cancelled", "interrupted"].includes(previous.status) &&
    previous.target.botId && (previous.target.botId !== receipt.target.botId ||
      (previous.target.executionId && previous.target.executionId !== receipt.target.executionId))) return;
  const next = [...read(scope).filter(row => row.queueId !== receipt.queueId && !(receipt.sendId && row.sendId === receipt.sendId)),
    { ...receipt, sendId: receipt.sendId ?? previous?.sendId, label: receipt.label ?? previous?.label }].slice(-32);
  receipts.set(scope, next);
  try { localStorage.setItem(prefix + scope, JSON.stringify(next)); } catch {}
  for (const listener of listeners) listener();
}

export function useRoomMessageReceipts(groupId: string | undefined, threadId: string) {
  const scope = groupId ? `${groupId}:${threadId}` : "";
  return useSyncExternalStore(subscribe, () => read(scope), () => empty);
}

export function useRoomInterjection(group: Group | undefined, threadId: string, items: Array<{ queueId: string; text?: string; sendId?: string }>, members: Bot[], dispatch: (action: Action) => void, connected = true, facts?: RoomMessageQueueSnapshot) {
  const scope = group ? `${group.id}:${threadId}` : "";
  const saved = useRoomMessageReceipts(group?.id, threadId);
  const [selection, select] = useState({ scope: "", key: "" });
  const [refresh, setRefresh] = useState(0);
  const revision = useRef(0);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const membersRef = useRef(members);
  membersRef.current = members;
  const identity = JSON.stringify(items.map(item => ({ queueId: item.queueId, sendId: item.sendId })));
  const executionState = JSON.stringify(group?.queue ?? []);
  const applyFacts = (snapshot: RoomMessageQueueSnapshot, inFlightAtReadStart?: ReadonlySet<string>) => {
    for (const item of snapshot.items) {
      rememberRoomSend(snapshot.groupId, snapshot.threadId, { queueId: item.queueId, sendId: item.sendId });
      const previous = read(scope).find(row => row.queueId === item.queueId);
      if (previous?.status === "delivered" && item.state !== "delivered") continue;
      if (previous?.status === "uncertain" && !previous.awaitingSnapshot && item.state === "pending") continue;
      if (["cancelled", "interrupted"].includes(previous?.status ?? "") && item.state === "pending") continue;
      const status = item.state === "pending" ? (previous?.status === "stale" ? "stale" : "queued") : item.state;
      save(scope, { queueId: item.queueId, sendId: item.sendId, target: item.state === "pending" && previous ? previous.target : { botId: item.botId ?? "", executionId: item.executionId ?? "" }, status,
        ...(item.state === "pending" && previous?.blockedBy ? { blockedBy: previous.blockedBy } : {}),
        name: membersRef.current.find(member => member.id === item.botId)?.name ?? item.botId ?? (item.state === "pending" ? previous?.name : "") ?? "", label: replySnippet(item.text, 100) },
      { confirmedPendingAfterDispatch: Boolean(inFlightAtReadStart) && item.state === "pending" &&
        !inFlightAtReadStart!.has(`${scope}:${item.queueId}`) && !inFlight.has(`${scope}:${item.queueId}`) });
    }
  };
  const applyFactsRef = useRef(applyFacts);
  applyFactsRef.current = applyFacts;
  useEffect(() => {
    if (facts?.groupId === group?.id && facts?.threadId === threadId) applyFactsRef.current(facts);
  }, [facts, group?.id, threadId]);
  useEffect(() => {
    if (!group || !scope || !connected) return;
    const controller = new AbortController();
    const version = revision.current;
    const inFlightAtReadStart = new Set(inFlight);
    const localItems: Array<{ queueId: string; sendId?: string }> = JSON.parse(identity);
    const currentItems = localItems.map(item => item.queueId.startsWith("send:") ? { sendId: item.sendId ?? item.queueId.slice(5) } : item);
    const remembered = roomSendReferences(group.id, threadId);
    const refs = [...remembered, ...currentItems, ...read(scope).filter(row => !row.queueId.startsWith("send:")).map(row => ({ queueId: row.queueId }))];
    for (const ref of remembered) {
      if (!ref.queueId && ref.sendId && !read(scope).some(row => row.sendId === ref.sendId)) save(scope, {
        queueId: `send:${ref.sendId}`, sendId: ref.sendId, target: { botId: "", executionId: "" }, name: "", status: "uncertain", awaitingSnapshot: true, label: replySnippet(ref.text ?? "", 100),
      });
    }
    for (const ref of currentItems) rememberRoomSend(group.id, threadId, ref);
    void recoverRoomQueue(api, group.id, threadId, refs, controller.signal).then(snapshot => {
      if (controller.signal.aborted || revision.current !== version) return;
      applyFactsRef.current(snapshot, inFlightAtReadStart);
      dispatchRef.current({ type: "roomQueueSnapshot", snapshot });
      for (const row of read(scope)) {
        if (!snapshot.items.some(item => item.queueId === row.queueId) && ["queued", "stale", "unavailable"].includes(row.status)) save(scope, { ...row, status: "uncertain", awaitingSnapshot: true });
      }
    }).catch(() => {
      if (controller.signal.aborted || revision.current !== version) return;
      for (const row of read(scope)) if (["queued", "stale"].includes(row.status)) save(scope, { ...row, status: "uncertain", awaitingSnapshot: true });
    });
    return () => controller.abort();
  }, [scope, group?.id, threadId, connected, identity, executionState, refresh]);
  useEffect(() => {
    if (!scope) return;
    for (const item of items) {
      if (!read(scope).some(row => row.queueId === item.queueId)) save(scope, {
        queueId: item.queueId, sendId: item.sendId, name: "", target: { botId: "", executionId: "" }, status: "uncertain", awaitingSnapshot: true, label: replySnippet(item.text ?? "", 100),
      });
    }
  }, [scope, items]);
  useEffect(() => {
    const supervisorId = group?.supervisorId;
    if (!scope || !supervisorId) return;
    for (const row of read(scope)) {
      if (!row.sendId || !["uncertain", "sending", "dispatching", "queued"].includes(row.status) ||
          (row.target.botId && row.target.botId !== supervisorId)) continue;
      const original = group.messages.find(message => message.role === "user" && message.sendId === row.sendId &&
        message.id !== optimisticMessageId(row.sendId!));
      if (!original || !group.messages.some(message => message.role === "bot" && message.kind === "text" &&
          message.from?.botId === supervisorId && message.replyToId === original.id)) continue;
      // A reply from this room's supervisor to this exact user message is
      // authoritative delivery evidence, even if the send receipt was lost.
      save(scope, { ...row, status: "delivered", awaitingSnapshot: false,
        target: { botId: supervisorId, executionId: row.target.executionId },
        name: membersRef.current.find(member => member.id === supervisorId)?.name ?? row.name });
    }
  }, [scope, group?.supervisorId, group?.messages, saved]);
  const candidates = (group?.queue ?? []).filter(entry => entry.threadId === threadId && entry.state === "running" && entry.executionId && !group?.holds?.[entry.botId]);
  const targets = candidates.filter((entry, index) => candidates.findIndex(other => other.botId === entry.botId && other.executionId === entry.executionId) === index)
    .map(entry => ({ botId: entry.botId, executionId: entry.executionId!, name: members.find(member => member.id === entry.botId)?.name ?? entry.botId,
      task: group ? roomExecutionTodo(group, entry)?.title : undefined }));
  const selectedKey = selection.scope === scope ? selection.key : targets.length === 1 ? targetKey(targets[0]!) : "";
  useEffect(() => {
    if (selection.scope !== scope) select({ scope, key: selectedKey });
  }, [scope, selectedKey, selection.scope]);
  const target = targets.find(candidate => targetKey(candidate) === selectedKey);
  const head = items[0]?.queueId;
  const headReceipt = saved.find(row => row.queueId === head);
  const disabledQueueIds = [...items.filter(item => !connected || !saved.some(row => row.queueId === item.queueId)).map(item => item.queueId), ...saved.filter(row => ["sending", "dispatching", "interrupted", "uncertain", "delivered", "unavailable", "cancelled"].includes(row.status)).map(row => row.queueId)];
  const enabled = Boolean(connected && group && head && target && headReceipt && ["queued", "stale"].includes(headReceipt.status) && !disabledQueueIds.includes(head));
  const steer = () => {
    if (!enabled || !group || !head || !target || inFlight.has(`${scope}:${head}`)) return;
    const lock = `${scope}:${head}`;
    inFlight.add(lock);
    revision.current++;
    save(scope, { queueId: head, target: { botId: target.botId, executionId: target.executionId }, name: target.name, status: "sending" });
    dispatch({ type: "steerGroupQueued", groupId: group.id, threadId, queueId: head, botId: target.botId, executionId: target.executionId,
      onReceipt: receipt => save(scope, { ...receipt,
        name: membersRef.current.find(member => member.id === receipt.target.botId)?.name ?? receipt.target.botId }),
      onSettled: () => { inFlight.delete(lock); setRefresh(value => value + 1); },
    });
  };
  const cancelled = (queueId: string) => {
    revision.current++;
    const previous = read(scope).find(row => row.queueId === queueId);
    save(scope, { queueId, target: previous?.target ?? target ?? { botId: "", executionId: "" }, name: previous?.name ?? target?.name ?? "", status: "cancelled" });
  };
  return { targets, selectedKey, select: (key: string) => select({ scope, key }), steer, enabled, disabledQueueIds,
    steering: headReceipt?.status === "sending", saved: saved.slice(-5), allSaved: saved, cancelled };
}
export type RoomInterjectionControls = ReturnType<typeof useRoomInterjection>;
