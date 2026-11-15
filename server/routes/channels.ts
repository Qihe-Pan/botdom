import { z } from "zod";
import type { ResolvedSender, WireGroup } from "../../shared/wire.ts";
import { admit } from "../admission.ts";
import { applyRoomTodoPersonAction, parseRoomTodoPersonAction, roomTodoOrderError, roomTodoPersonActionError } from "../../shared/room-todo.ts";
import {
  cancelChannelMessage,
  cancelChannelMessages,
  channelQueueHeld,
  dispatchHeldChannelQueueHead,
  headChannelGroup,
  hasChannelMessage,
  holdChannelQueue,
  queueChannelMessage,
  queuedChannelMessage,
  resolveHeldReplyTarget,
  restoreHeldChannelQueue,
  settleHeldChannelQueueHead,
} from "../channel-queue.ts";
import { DATA_DIR, type AppConfig } from "../config.ts";
import type { ProviderInstance, SteerOutcome } from "../contracts.ts";
import { cancelledChatFollowup, findRoomSendReceipt, patchRoomSendReceipts, roomSendReceipts } from "../message-db.ts";
import { messageTextRefusal } from "../message-text.ts";
import type { PhoneSecretSubmissionRegistry } from "../phone-secret.ts";
import { promptWithReply, type PersonName } from "../replies.ts";
import { clientGroupPatchViolation, requestSource, type RequestAuth } from "../request-auth.ts";
import type { RoomContextTracker } from "../room-context.ts";
import { parseConversationTurnTimeout } from "../room-turn-timeout.ts";
import type { RoutineManager } from "../routines.ts";
import { acceptedSendMatch, parseSendId, sendFingerprint, type SendSequencer } from "../send-idempotency.ts";
import type { SkillReview } from "../skill-review.ts";
import { assertWithinBudget } from "../spend.ts";
import type { BotRecord, GroupRecord, GroupTaskPatch, Message, Store } from "../store.ts";
import { roomResponders } from "../store.ts";
import type { ThreadStarters } from "../thread-starters.ts";
import { extractSteerImages } from "../turn-images.ts";
import type { UsageTrigger } from "../usage-ledger.ts";
import { bulkDeleteThreadIds, type BulkDeleteRefusal } from "./bulk-delete.ts";
import { PASS, type RouteHandler } from "./table.ts";
import { sawThread } from "../thread-presence.ts";
import { readThreadNotifications } from "./notifications.ts";

export type MessagePage = { messages: Array<Message | Record<string, unknown>>; hasMore?: boolean; activeLeafId: string | null };

export interface ChannelRouteDeps {
  store: Pick<Store,
    | "group" | "groupTaskByThread" | "bot" | "switchGroupTask" | "patchGroupTask" | "patchGroup" | "messagesFor" | "groupTasks" | "deleteGroupTasks" | "deleteGroup"
    | "createGroupTask" | "appendMessage" | "updateRoomTodos">;
  cfg: Pick<AppConfig, "budgets">;
  /** What people's lines are called in this conversation (replies.ts PersonName). */
  userName(threadId: string): PersonName;
  /** The desktop app owns this server, so a loopback caller is its owner. */
  desktopManaged: boolean;
  routines(): Pick<RoutineManager, "disableForGroup"> | null;
  broadcast(payload: Record<string, unknown>): void;
  actorKey(auth: RequestAuth & { kind: "session" }): string;
  threadStarters: Pick<ThreadStarters, "set">;
  phoneSecretSubmissions: Pick<PhoneSecretSubmissionRegistry, "hasGroup" | "hasThread">;
  sendSequencer: Pick<SendSequencer, "run">;
  roomMemberContexts: Pick<RoomContextTracker, "request">;
  skillReview: Pick<SkillReview, "dropThread">;
  groupSpeakers: ReadonlyMap<string, { botId: string }>;
  roomSteerTargets?(threadId: string): Array<{ threadId: string; botId: string; executionId?: string }>;
  groupTurnOperations: ReadonlyMap<string, ReadonlySet<{ threadId: string; cancelled: boolean }>>;
  lastReply: Pick<Map<string, string>, "delete">;
  cloudThreadRefusal(auth: RequestAuth, threadId: string): string | null;
  roomQueueVisible?(auth: RequestAuth, groupId: string, threadId: string): boolean;
  messageSender(auth: RequestAuth): ResolvedSender | undefined;
  roomLiveEpoch?: string;
  usageTriggerFor(auth: RequestAuth): UsageTrigger;
  publicGroupState(record: GroupRecord): WireGroup;
  groupWithThread(group: GroupRecord): WireGroup;
  updateChannel(groupId: string, value: unknown): GroupRecord;
  groupIsWorking(group: GroupRecord): boolean;
  groupThreadIsWorking(groupId: string, threadId: string): boolean;
  canStartSupervisorResponse?(groupId: string, threadId: string, text: string): boolean;
  cancelQueuedGoalFollowup?(groupId: string, threadId: string, queueId: string): void;
  recordQueuedGoalFollowup?(groupId: string, threadId: string, queueId: string, text: string, options: {
    sendId?: string; replyToId?: string; sender?: ResolvedSender; trigger?: UsageTrigger;
  }): void;
  readCursor(threadId: string): { lastReadMessageId?: string };
  /** A person opened this room (a Team Cloud's Needs you lines for them there are done). */
  threadRead?(auth: RequestAuth, threadId: string): void;
  /** A Team Cloud: marks the room read or unread for this person alone and answers the room as they see it; null where a
   * room is read once for everyone. */
  personMarkRoom?(auth: RequestAuth, room: GroupRecord, unread: boolean): WireGroup | null;
  /** A room as this person has read it (a Team Cloud); the room itself anywhere else. */
  groupFor?(auth: RequestAuth, group: WireGroup): WireGroup;
  pageSize(raw: string | null): number | null | undefined;
  messagePage(threadId: string, limit: number | undefined): MessagePage;
  resolveReplyTarget(threadId: string, value: unknown): Message | undefined;
  runningTurnInstance(bot: BotRecord | null | undefined, threadId: string): ProviderInstance | null;
  engineSteersImages(instance: ProviderInstance | null | undefined): boolean;
  startGroupTurn(
    groupId: string,
    text: string,
    replyTo: Message | undefined,
    sendId: string | undefined,
    channelMode: "chat" | "goal",
    queueId: undefined,
    options: { via?: "api"; sender?: ResolvedSender; trigger?: UsageTrigger; threadId?: string },
  ): Message;
  applyRoomHoldsFromMessage(groupId: string, text: string): void;
  cancelGroupTurnOperations(groupId: string, threadId: string): void;
  drainQueuedChannelSends(): void;
  clearTurnDigestState(threadId: string): void;
  closeOpenApprovals(threadId: string): void;
  revokeInternalCapabilitiesForThread(threadId: string): void;
  stagedSkillCleanupsForThread(threadId: string): Array<{ botId: string; stagedId: string }>;
  rejectDeletedThreadSkillStages(cleanups: Array<{ botId: string; stagedId: string }>): void;
}

const createGroupTaskRequestSchema = z.object({ title: z.string().optional() });

export function createChannelRoutes(deps: ChannelRouteDeps): RouteHandler {
  const {
    store, cfg, broadcast, actorKey, threadStarters, phoneSecretSubmissions, sendSequencer, roomMemberContexts, skillReview,
    groupSpeakers, lastReply, cloudThreadRefusal, messageSender, usageTriggerFor, publicGroupState,
    groupWithThread, updateChannel, groupIsWorking, groupThreadIsWorking, readCursor, pageSize, messagePage,
    resolveReplyTarget, runningTurnInstance, startGroupTurn, engineSteersImages, applyRoomHoldsFromMessage, cancelGroupTurnOperations,
    drainQueuedChannelSends, clearTurnDigestState, closeOpenApprovals, revokeInternalCapabilitiesForThread,
    stagedSkillCleanupsForThread, rejectDeletedThreadSkillStages,
  } = deps;
  const DESKTOP_MANAGED = deps.desktopManaged;
  const deleteRefusal = (auth: RequestAuth, groupId: string, threadId: string): { status: 403 | 404 | 409; error: string } | null => {
    if (phoneSecretSubmissions.hasThread(threadId)) {
      return { status: 409, error: "this task is securely saving a credential — try again when it finishes" };
    }
    if (groupThreadIsWorking(groupId, threadId)) return { status: 409, error: "this task is running — stop it first" };
    if (!store.groupTaskByThread(groupId, threadId)) return { status: 404, error: "no such channel task" };
    const notYours = cloudThreadRefusal(auth, threadId);
    return notYours ? { status: 403, error: notYours } : null;
  };
  const deleteGroupTasks = (groupId: string, threadIds: string[]) => {
    const stagedSkillCleanups = new Map(threadIds.map((threadId) => [threadId, stagedSkillCleanupsForThread(threadId)]));
    const result = store.deleteGroupTasks(groupId, threadIds);
    for (const threadId of result?.deleted ?? []) {
      lastReply.delete(threadId);
      clearTurnDigestState(threadId);
      skillReview.dropThread(threadId);
      revokeInternalCapabilitiesForThread(threadId);
      rejectDeletedThreadSkillStages(stagedSkillCleanups.get(threadId) ?? []);
    }
    return result;
  };
  return async ({ req, res, url, path, method, auth, json, readBody }) => {
    const own = (group: WireGroup) => deps.groupFor?.(auth, group) ?? group;
    const queueAuthor = () => auth.kind === "session" ? actorKey(auth) : "local";
    const queueVisible = (groupId: string, threadId: string) => deps.roomQueueVisible?.(auth, groupId, threadId) ?? !cloudThreadRefusal(auth, threadId);
    let m: RegExpMatchArray | null = null;
    const routines = deps.routines();

    m = path.match(/^\/api\/groups\/([\w-]+)\/tasks$/);
    if (m && method === "POST") {
      const body = await readBody(req);
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such channel" });
      if (group.dm) return json(res, 400, { error: "bot-to-bot channels keep one canonical conversation" });
      if (phoneSecretSubmissions.hasGroup(group.id)) {
        return json(res, 409, { error: "this channel is securely saving a credential — try again when it finishes" });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(res, 400, { error: "body must be a JSON object" });
      }
      const request = createGroupTaskRequestSchema.safeParse(body);
      if (!request.success) return json(res, 400, { error: "title must be text" });
      const task = store.createGroupTask(group.id, request.data.title);
      if (!task) return json(res, 500, { error: "couldn't create that task" });
      // Who opened it decides who may answer its cards on a shared workspace.
      if (auth.kind === "session") threadStarters.set(task.threadId, actorKey(auth));
      return json(res, 201, { group: own(groupWithThread(store.group(group.id)!)), task });
    }

    m = path.match(/^\/api\/groups\/([\w-]+)\/tasks\/delete$/);
    if (m && method === "POST") {
      const parsed = bulkDeleteThreadIds(await readBody(req));
      if (!parsed.ok) return json(res, 400, { error: parsed.error });
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such channel" });
      if (group.dm) return json(res, 400, { error: "bot-to-bot channels keep one canonical conversation" });
      const allowed: string[] = [];
      const refused: BulkDeleteRefusal[] = [];
      for (const threadId of parsed.threadIds) {
        const refusal = deleteRefusal(auth, group.id, threadId);
        if (!refusal) allowed.push(threadId);
        else refused.push({ threadId, reason: refusal.status === 409 ? "busy" : "not-found" });
      }
      if (allowed.length >= (group.tasks?.length ?? 1)) return json(res, 400, { error: "a channel keeps at least one task" });
      const result = deleteGroupTasks(group.id, allowed);
      if (!result) return json(res, 400, { error: "a channel keeps at least one task" });
      return json(res, 200, { group: own(groupWithThread(result.group)), deleted: result.deleted, refused });
    }

    m = path.match(/^\/api\/groups\/([\w-]+)\/tasks\/([\w-]+)\/todos$/);
    if (m && method === "POST") {
      const group = store.group(m[1]);
      if (!group || group.dm) return json(res, 404, { error: "no such channel" });
      if (!store.groupTaskByThread(group.id, m[2])) return json(res, 404, { error: "no such channel task" });
      const notYours = cloudThreadRefusal(auth, m[2]);
      if (notYours) return json(res, 403, { error: notYours });
      const action = parseRoomTodoPersonAction(await readBody(req));
      if (typeof action === "string") return json(res, 400, { error: action });
      let missing = false;
      let orderError: string | null = null;
      const todos = store.updateRoomTodos(group.id, m[2], (list) => {
        orderError = roomTodoOrderError(list, action) ?? roomTodoPersonActionError(list, action);
        if (orderError) return list;
        const next = applyRoomTodoPersonAction(list, action);
        if (!next) missing = true;
        return next ?? list;
      });
      if (orderError) return json(res, 409, { error: orderError });
      if (missing || !todos) return json(res, 404, { error: "no such task board item" });
      return json(res, 200, { todos, boardRevision: store.groupTaskByThread(group.id, m[2])!.boardRevision, roomLiveEpoch: deps.roomLiveEpoch });
    }

    m = path.match(/^\/api\/groups\/([\w-]+)\/tasks\/([\w-]+)$/);
    if (m && method === "POST") {
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such channel" });
      if (group.dm) return json(res, 400, { error: "bot-to-bot channels keep one canonical conversation" });
      if (phoneSecretSubmissions.hasGroup(group.id)) {
        return json(res, 409, { error: "this channel is securely saving a credential — try again when it finishes" });
      }
      // Parsed before the switch: a rejected parameter must not leave the channel on another thread.
      const requestedMessages = url.searchParams.get("messages");
      const switchLimit = pageSize(requestedMessages);
      if (switchLimit === null) return json(res, 400, { error: "messages must be a non-negative whole number" });
      const switched = store.switchGroupTask(group.id, m[2]);
      if (!switched) return json(res, 404, { error: "no such channel task" });
      deps.threadRead?.(auth, switched.threadId);
      readThreadNotifications(switched.threadId, broadcast, auth);
      const switchedSettings = own(publicGroupState(switched));
      // "0": settings only (no `messages` key); a positive page: that tail; omitted: the whole transcript.
      const responseGroup = requestedMessages === "0"
        ? switchedSettings
        : { ...switchedSettings, ...messagePage(switched.threadId, switchLimit) };
      return json(res, 200, { group: responseGroup });
    }
    if (m && method === "PATCH") {
      const body = await readBody(req);
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such channel" });
      if (group.dm) return json(res, 400, { error: "bot-to-bot channels keep one canonical conversation" });
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(res, 400, { error: "body must be a JSON object" });
      }
      const allowed = new Set(["title", "pinned", "turnTimeoutMinutes", "archivedAt"]);
      if (Object.keys(body).some((key) => !allowed.has(key))) return json(res, 400, { error: "unsupported channel thread setting" });
      const existing = store.groupTaskByThread(group.id, m[2]);
      if (!existing) return json(res, 404, { error: "no such channel task" });
      const pinning = body.pinned !== undefined;
      const renaming = body.title !== undefined;
      const limiting = Object.prototype.hasOwnProperty.call(body, "turnTimeoutMinutes");
      const archiving = body.archivedAt !== undefined;
      if (!pinning && !renaming && !limiting && !archiving) return json(res, 400, { error: "unsupported channel thread setting" });
      if (pinning && typeof body.pinned !== "boolean") return json(res, 400, { error: "pinned must be a boolean" });
      if (renaming && typeof body.title !== "string") return json(res, 400, { error: "title must be a string" });
      if (archiving && body.archivedAt !== null && !(typeof body.archivedAt === "number" && Number.isFinite(body.archivedAt) && body.archivedAt >= 0)) {
        return json(res, 400, { error: "archivedAt must be a timestamp, or null to unarchive" });
      }
      const parsedLimit = limiting ? parseConversationTurnTimeout(body.turnTimeoutMinutes) : null;
      if (parsedLimit && !parsedLimit.ok) return json(res, 400, { error: parsedLimit.error });
      // Echoing the current title is not a rename: newer clients send it so an older server keeps the title.
      const titleChange = renaming && body.title !== existing.title;
      const notYours = titleChange ? cloudThreadRefusal(auth, m[2]) : null;
      if (notYours) return json(res, 403, { error: notYours });
      if (titleChange && groupThreadIsWorking(group.id, m[2])) {
        return json(res, 409, { error: "this task is running — stop it first" });
      }
      const patch: GroupTaskPatch = {
        ...(parsedLimit?.ok ? { turnTimeoutMinutes: parsedLimit.minutes } : {}),
        ...(pinning ? { pinned: body.pinned === true } : {}),
        ...(archiving ? { archivedAt: body.archivedAt as number | null } : {}),
        ...(titleChange ? { title: body.title } : {}),
      };
      const task = Object.keys(patch).length ? store.patchGroupTask(group.id, m[2], patch) : existing;
      if (!task) return json(res, 404, { error: "no such channel task" });
      return json(res, 200, { task });
    }
    if (m && method === "DELETE") {
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such channel" });
      if (group.dm) return json(res, 400, { error: "bot-to-bot channels keep one canonical conversation" });
      const refusal = deleteRefusal(auth, group.id, m[2]);
      if (refusal) return json(res, refusal.status, { error: refusal.error });
      const updated = deleteGroupTasks(group.id, [m[2]]);
      if (!updated?.deleted.length) return json(res, 400, { error: "a channel keeps at least one task" });
      return json(res, 200, { group: own(groupWithThread(updated.group)) });
    }

    m = path.match(/^\/api\/groups\/([\w-]+)$/);
    if (m && method === "PATCH") {
      const body = await readBody(req);
      if (auth.kind === "session" && !auth.scopes.includes("admin")) {
        const field = clientGroupPatchViolation(body);
        if (field) return json(res, 403, { error: `forbidden: this session may rename or mark a room, not change "${field}" (needs the admin scope)` });
      }
      const renamed = store.group(m[1]);
      if (renamed && body && typeof body === "object" &&
        ((body.name !== undefined && body.name !== renamed.name) || (body.bulletin !== undefined && body.bulletin !== (renamed.bulletin ?? "")))) {
        const notYours = cloudThreadRefusal(auth, renamed.threadId);
        if (notYours) return json(res, 403, { error: notYours });
      }
      if (deps.personMarkRoom && auth.kind === "session" && renamed && typeof body?.unread === "boolean") {
        const { unread, ...shared } = body;
        const group = Object.keys(shared).length ? updateChannel(m[1], shared) : renamed;
        return json(res, 200, { group: deps.personMarkRoom(auth, group, unread) ?? own(publicGroupState(group)) });
      }
      const group = updateChannel(m[1], body);
      return json(res, 200, { group: own(publicGroupState(group)) });
    }
    m = path.match(/^\/api\/groups\/([\w-]+)\/read$/);
    if (m && method === "POST") {
      const room = store.group(m[1]);
      if (!room) return json(res, 404, { error: "no such room" });
      sawThread(room.threadId);
      deps.threadRead?.(auth, room.threadId);
      const personal = deps.personMarkRoom?.(auth, room, false);
      if (personal) {
        readThreadNotifications(room.threadId, broadcast, auth);
        return json(res, 200, { group: personal });
      }
      const group = store.patchGroup(room.id, { unread: false, ...readCursor(room.threadId) })!;
      readThreadNotifications(room.threadId, broadcast, auth);
      broadcast({ kind: "group", group: publicGroupState(group) });
      return json(res, 200, { group: own(publicGroupState(group)) });
    }
    m = path.match(/^\/api\/groups\/([\w-]+)$/);
    if (m && method === "DELETE") {
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such room" });
      if (phoneSecretSubmissions.hasGroup(group.id)) {
        return json(res, 409, { error: "this channel is securely saving a credential — try again when it finishes" });
      }
      if (groupIsWorking(group)) {
        return json(res, 409, { error: "this channel is working — stop that turn first" });
      }
      const threadIds = new Set([group.threadId, ...(group.tasks ?? []).map((task) => task.threadId)]);
      const stagedSkillCleanups = [...threadIds].flatMap(stagedSkillCleanupsForThread);
      for (const threadId of threadIds) {
        lastReply.delete(threadId);
        clearTurnDigestState(threadId);
        skillReview.dropThread(threadId);
      }
      routines!.disableForGroup(group.id);
      store.deleteGroup(group.id);
      rejectDeletedThreadSkillStages(stagedSkillCleanups);
      return json(res, 200, { ok: true });
    }
    m = path.match(/^\/api\/groups\/([\w-]+)\/messages$/);
    if (m && method === "POST") {
      const body = await readBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(res, 400, { error: "body must be a JSON object" });
      }
      const textRefused = messageTextRefusal(body.text);
      if (textRefused) return json(res, 400, { error: textRefused });
      const text = String(body.text ?? "").trim();
      if (!text) return json(res, 400, { error: "text required" });
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such group" });
      if (body.mode !== undefined && body.mode !== "chat" && body.mode !== "goal") {
        return json(res, 400, { error: "mode must be chat or goal" });
      }
      const channelMode: "chat" | "goal" = body.mode === "goal" ? "goal" : "chat";
      if (group.dm && channelMode === "goal") {
        return json(res, 400, { error: "goal mode is available in team channels, not bot-to-bot channels" });
      }
      if (body.threadId !== undefined && (typeof body.threadId !== "string" || !/^[\w-]+$/.test(body.threadId))) {
        return json(res, 400, { error: "threadId must be a task id" });
      }
      const threadId = body.threadId ?? group.threadId;
      const trigger = usageTriggerFor(auth);
      try {
        assertWithinBudget(cfg, DATA_DIR);
      } catch (error) {
        return json(res, 409, { error: error instanceof Error ? error.message : String(error), code: "spend_cap" });
      }
      const ownsThread = group.dm
        ? group.threadId === threadId
        : Boolean(store.groupTaskByThread(group.id, threadId));
      if (!ownsThread) {
        return json(res, 409, { error: "the channel switched tasks before it could receive the message" });
      }
      const sendId = parseSendId(body.sendId);
      const replyTo = resolveReplyTarget(threadId, body.replyToId);
      // A bot's shell is a loopback caller too: with no paired session and no browser origin the message
      // is stamped, not trusted as typed (readers, posting budget and transcript see the stamp), and logged.
      const browserOrigin = typeof req.headers.origin === "string" && req.headers.origin.trim() !== "";
      const via: "api" | undefined =
        auth.kind === "loopback" && !DESKTOP_MANAGED && !browserOrigin ? "api" : undefined;
      if (via) {
        console.warn(`room message from ${requestSource(req)} through the local API (no session, no browser origin) into "${group.name}"`);
      }
      const receipt = await sendSequencer.run(
        sendId ? `group:${group.id}:${threadId}:${queueAuthor()}:${sendId}` : undefined,
        sendFingerprint(text, replyTo?.id, channelMode),
        async () => {
          if (sendId) {
            const stored = findRoomSendReceipt(group.id, { threadId, sendId });
            if (stored && stored.authorKey !== queueAuthor()) {
              throw Object.assign(new Error("sendId already belongs to another message"), { status: 409 });
            }
            if (cancelledChatFollowup("channel", group.id, threadId, sendId)) {
              throw Object.assign(new Error("this queued sendId was cancelled; send a new message to try again"), { status: 409 });
            }
            if (stored && (stored.receipt.text !== text || stored.receipt.replyToId !== replyTo?.id || stored.receipt.mode !== channelMode)) {
              throw Object.assign(new Error("sendId already belongs to another message"), { status: 409 });
            }
            const accepted = acceptedSendMatch(store.messagesFor(threadId), sendId, text, replyTo?.id, channelMode);
            if (accepted.kind === "conflict") {
              throw Object.assign(new Error("sendId already belongs to another message"), { status: 409 });
            }
            if (accepted.kind === "match") {
              return { ok: true as const, threadId, message: accepted.message, ...(stored ? { queueReceipt: stored.receipt } : {}) };
            }
            if (stored && stored.receipt.state !== "pending") return { ok: true as const, threadId, queueId: stored.receipt.queueId, queueReceipt: stored.receipt };
            const queued = queuedChannelMessage(group.id, threadId, sendId);
            if (queued) {
              if (
                queued.text !== text ||
                queued.replyToId !== replyTo?.id ||
                queued.mode !== channelMode
              ) {
                throw Object.assign(new Error("sendId already belongs to another message"), { status: 409 });
              }
              return { ok: true as const, queued: true as const, queueId: queued.id, threadId };
            }
          }
          const current = store.group(group.id);
          if (!current) throw Object.assign(new Error("no such group"), { status: 404 });
          const ownsTarget = current.threadId === threadId || store.groupTasks(current.id).some((task) => task.threadId === threadId);
          if (!ownsTarget) {
            throw Object.assign(new Error("no such thread in channel"), {
              status: 404,
            });
          }
          if (channelMode === "chat") applyRoomHoldsFromMessage(current.id, text);
          const supervisorReady = channelMode === "chat" && !via && (trigger.kind === "user" || trigger.kind === "owner") &&
            deps.canStartSupervisorResponse?.(current.id, threadId, text);
          const threadWorking = (!supervisorReady && groupThreadIsWorking(current.id, threadId)) || channelQueueHeld(threadId);
          const decision = admit("room", {}, { roomWorking: threadWorking, threadWorking });
          if (decision.action === "queue") {
            const queued = queueChannelMessage(current.id, threadId, text, {
              replyToId: replyTo?.id,
              sendId,
              mode: channelMode,
              via,
              sender: messageSender(auth),
              trigger,
              authorKey: queueAuthor(),
            });
            if (channelMode === "chat" && !via && (trigger.kind === "user" || trigger.kind === "owner")) {
              deps.recordQueuedGoalFollowup?.(current.id, threadId, queued.id, text, { sendId, replyToId: replyTo?.id, sender: messageSender(auth), trigger });
            }
            return { ok: true as const, queued: true as const, queueId: queued.id, threadId };
          }
          const message = startGroupTurn(current.id, text, replyTo, sendId, channelMode, undefined, { via, sender: messageSender(auth), trigger, threadId });
          return { ok: true as const, threadId, message };
        },
      );
      return json(res, 202, receipt);
    }
    m = path.match(/^\/api\/groups\/([\w-]+)\/queue$/);
    if (m && method === "GET") {
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such group" });
      const threadId = url.searchParams.get("threadId") ?? group.threadId;
      if (!(group.dm ? group.threadId === threadId : store.groupTaskByThread(group.id, threadId)) || !queueVisible(group.id, threadId)) {
        return json(res, 404, { error: "no such conversation" });
      }
      const queueId = url.searchParams.get("queueId"), sendId = url.searchParams.get("sendId");
      const items = roomSendReceipts(group.id, threadId, queueAuthor())
        .filter(item => (!queueId || item.queueId === queueId) && (!sendId || item.sendId === sendId));
      res.setHeader("Cache-Control", "no-store");
      return json(res, 200, { groupId: group.id, threadId, items });
    }
    m = path.match(/^\/api\/groups\/([\w-]+)\/queue\/([\w-]+)$/);
    if (m && method === "DELETE") {
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such group" });
      const stored = findRoomSendReceipt(group.id, { queueId: m[2] });
      if (!stored || stored.authorKey !== queueAuthor() || !queueVisible(group.id, stored.receipt.threadId)) return json(res, 404, { error: "no such queued message" });
      if (!cancelChannelMessage(group.id, m[2])) {
        return json(res, 404, { error: "no such queued message" });
      }
      deps.cancelQueuedGoalFollowup?.(group.id, stored.receipt.threadId, m[2]);
      return json(res, 200, { ok: true });
    }

    // Steers the queued head into the running room turn without interrupting it; a driver that cannot steer keeps the queue.
    m = path.match(/^\/api\/groups\/([\w-]+)\/queue\/([\w-]+)\/steer$/);
    if (m && method === "POST") {
      const body = await readBody(req);
      if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
        return json(res, 400, { error: "body must be a JSON object" });
      }
      const threadId = typeof body?.threadId === "string" ? body.threadId : undefined;
      if (body?.threadId !== undefined && (typeof body.threadId !== "string" || !/^[\w-]+$/.test(body.threadId))) {
        return json(res, 400, { error: "threadId must be a task id" });
      }
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such room" });
      const targetThreadId = threadId ?? group.threadId;
      for (const key of ["botId", "executionId"] as const) {
        if (body?.[key] !== undefined && (typeof body[key] !== "string" || !/^[\w-]+$/.test(body[key]))) {
          return json(res, 400, { error: `${key} must be an id` });
        }
      }
      const notYours = cloudThreadRefusal(auth, targetThreadId);
      if (notYours) return json(res, 403, { error: notYours });
      const ownsThread = group.dm
        ? group.threadId === targetThreadId
        : Boolean(store.groupTaskByThread(group.id, targetThreadId));
      if (!ownsThread) {
        return json(res, 409, { error: "the channel switched tasks before it could receive the message" });
      }
      const stored = findRoomSendReceipt(group.id, { queueId: m[2] });
      if (!stored || stored.authorKey !== queueAuthor() || stored.receipt.threadId !== targetThreadId || !queueVisible(group.id, targetThreadId)) {
        return json(res, 404, { error: "no such queued message" });
      }
      // A previously claimed queue ID must be reconciled with its own
      // author-scoped durable receipt, never delivered a second time.
      if (stored.receipt.state !== "pending") return json(res, 200, { ok: true, queueReceipt: stored.receipt });
      const current = store.group(group.id);
      if (!current) return json(res, 404, { error: "no such room" });
      const legacyBotId =
        groupSpeakers.get(targetThreadId)?.botId ??
        (targetThreadId === current.threadId ? current.busyBotId : undefined);
      const targets: Array<{ threadId: string; botId: string; executionId?: string }> = deps.roomSteerTargets?.(targetThreadId) ??
        (legacyBotId ? [{ threadId: targetThreadId, botId: legacyBotId }] : []);
      const candidates = targets.filter(target => (!body?.botId || target.botId === body.botId) &&
        (!body?.executionId || target.executionId === body.executionId));
      if (candidates.length > 1) {
        return json(res, 409, { error: "choose a running employee for this message", code: "room_steer_target_required" });
      }
      if ((body?.botId || body?.executionId) && !candidates.length) {
        return json(res, 409, { error: "that employee execution is no longer running", code: "room_steer_target_stale" });
      }
      const target = candidates[0];
      const speakerBotId = target?.botId;
      const speaker = speakerBotId ? store.bot(speakerBotId) : undefined;
      const instance = speaker && target ? runningTurnInstance(speaker, target.threadId) : undefined;
      // Hold the queue atomically: the room's settle drains it or this request steers its head, never both.
      const held = holdChannelQueue(current.id, targetThreadId, m[2]);
      if (!held) {
        if (hasChannelMessage(current.id, targetThreadId, m[2]!)) return json(res, 200, { ok: true, queued: true, threadId: targetThreadId, blockedBy: "queue_head" });
        return json(res, 409, { error: "queue state cannot be confirmed", code: "room_queue_uncertain" });
      }
      const headGroup = headChannelGroup(held.items);
      const [head] = headGroup;
      const members = current.memberIds.map((id) => store.bot(id)).filter((bot): bot is BotRecord => Boolean(bot));
      const aliases: Array<{ id: string; name: string; hidden?: boolean }> = [...members];
      if (current.supervisorId && !members.some((bot) => bot.name.trim() === "主管")) {
        aliases.push({ id: current.supervisorId, name: "主管" });
      }
      const namesAnotherMember = headGroup.some((item) =>
        roomResponders(item.text, aliases, { kind: "mentions" }).some((member) => member.id !== speakerBotId),
      );
      if (speakerBotId && namesAnotherMember) {
        restoreHeldChannelQueue(held);
        return json(res, 200, { ok: true, queued: true, threadId: targetThreadId, blockedBy: "recipient" });
      }
      const steerInput = extractSteerImages(headGroup.map((item) => item.text));
      const decision = admit("room-steer", {
        speakerPresent: Boolean(speaker),
        engineCanSteer: Boolean(instance?.adapter.capabilities.queueing && instance.adapter.steer),
        carriesImages: !steerInput || steerInput.images.length > 0,
        engineCanSteerImages: Boolean(steerInput) && engineSteersImages(instance),
        isQueueHead: Boolean(head && head.id === m[2]),
      });
      if (decision.action === "refuse") {
        restoreHeldChannelQueue(held);
        return json(res, 409, { error: "only the first queued message can steer" });
      }
      if (decision.action === "queue" || !steerInput || !target || !instance?.adapter.steer) {
        restoreHeldChannelQueue(held);
        if (!groupThreadIsWorking(current.id, targetThreadId)) drainQueuedChannelSends();
        return json(res, 200, {
          ok: true,
          queued: true,
          threadId: targetThreadId,
          ...(decision.action === "queue" && decision.blockedBy ? { blockedBy: decision.blockedBy } : {}),
        });
      }
      let foldedPrompt: string;
      try {
        const replyTo = resolveHeldReplyTarget(held, resolveReplyTarget);
        const speakerName = deps.userName(targetThreadId);
        foldedPrompt = headGroup
          .map((item, index) =>
            promptWithReply(
              steerInput.texts[index] ?? item.text,
              index === 0
                ? replyTo
                : item.replyToId
                  ? resolveReplyTarget(targetThreadId, item.replyToId)
                  : undefined,
              speakerName,
            ),
          )
          .join("\n\n");
      } catch (error) {
        restoreHeldChannelQueue(held);
        throw error;
      }
      dispatchHeldChannelQueueHead(held, target);
      let steered: SteerOutcome;
      try {
        steered = await (steerInput.images.length > 0
          ? instance.adapter.steer(target.threadId, foldedPrompt, steerInput.images)
          : instance.adapter.steer(target.threadId, foldedPrompt));
      } catch {
        steered = "indeterminate";
      }
      const after = store.group(current.id);
      if (steered !== "refused") patchRoomSendReceipts(headGroup.map(item => item.id), { state: steered === "indeterminate" ? "uncertain" : "delivered" });
      // "indeterminate" never restores: the words may already be in the live turn, and a replay would run them twice.
      const delivered = steered !== "refused";
      if (after && steered === "indeterminate") {
        // Keep uncertain text in the author's receipt, not in the shared transcript used by later model turns.
        settleHeldChannelQueueHead(held);
        if (!groupThreadIsWorking(after.id, targetThreadId)) drainQueuedChannelSends();
        return json(res, 200, {
          ok: true, steered: true, threadId: targetThreadId, delivery: "uncertain",
          botId: target?.botId, executionId: target?.executionId, messages: [],
          queueIds: headGroup.map((item) => item.id),
        });
      }
      if (after && delivered) {
        const messages = headGroup.map((item) => store.appendMessage(targetThreadId, {
          role: "user",
          kind: "text",
          text: item.text,
          replyToId: item.replyToId,
          sendId: item.sendId,
          channelMode: item.mode,
          queueId: item.id,
          via: item.via,
          steered: true,
          sender: item.sender,
        }));
        for (const [index, message] of messages.entries()) patchRoomSendReceipts([headGroup[index]!.id], { messageId: message.id });
        settleHeldChannelQueueHead(held);
        if (!groupThreadIsWorking(after.id, targetThreadId)) drainQueuedChannelSends();
        return json(res, 200, {
          ok: true,
          steered: true,
          threadId: targetThreadId,
          delivery: steered === "indeterminate" ? "uncertain" : "delivered",
          botId: target?.botId,
          executionId: target?.executionId,
          messages,
          queueIds: headGroup.map((item) => item.id),
        });
      }
      if (delivered && !after) {
        // Settle the head so a restart cannot replay words the dead turn may have run.
        settleHeldChannelQueueHead(held);
        return json(res, 404, { error: "no such room" });
      }
      restoreHeldChannelQueue(held);
      if (after && !groupThreadIsWorking(after.id, targetThreadId)) drainQueuedChannelSends();
      return json(res, 200, { ok: true, queued: true, threadId: targetThreadId });
    }
    m = path.match(/^\/api\/groups\/([\w-]+)\/members\/([\w-]+)\/compact$/);
    if (m && method === "POST") {
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such room" });
      if (!group.memberIds.includes(m[2])) return json(res, 404, { error: "that bot is not in this room" });
      const notYours = cloudThreadRefusal(auth, group.threadId);
      if (notYours) return json(res, 403, { error: notYours });
      if (!roomMemberContexts.request(group.threadId, m[2])) {
        return json(res, 409, { error: "this bot has no measured context in this room yet" });
      }
      const visible = publicGroupState(store.group(group.id) ?? group);
      broadcast({ kind: "group", group: visible });
      return json(res, 202, { ok: true, threadId: group.threadId, group: own(visible) });
    }
    m = path.match(/^\/api\/groups\/([\w-]+)\/interrupt$/);
    if (m && method === "POST") {
      const group = store.group(m[1]);
      if (!group) return json(res, 404, { error: "no such room" });
      const rawBody = await readBody(req);
      if (rawBody !== null && (typeof rawBody !== "object" || Array.isArray(rawBody))) {
        return json(res, 400, { error: "body must be a JSON object" });
      }
      const body = rawBody ?? {};
      if (body.threadId !== undefined && (typeof body.threadId !== "string" || !/^[\w-]+$/.test(body.threadId))) {
        return json(res, 400, { error: "threadId must be a task id" });
      }
      if (body.threadId !== undefined) {
        const ownsThread = group.dm
          ? body.threadId === group.threadId
          : Boolean(store.groupTaskByThread(group.id, body.threadId));
        if (!ownsThread) {
          return json(res, 409, { error: "the channel switched tasks before it could be interrupted" });
        }
      }
      const targetThreadIds = body.threadId !== undefined
        ? [body.threadId]
        : [...new Set([group.threadId, ...store.groupTasks(group.id).map(task => task.threadId)])];
      const interruptTargets = targetThreadIds.map((threadId) => {
        const speaker = groupSpeakers.get(threadId);
        const busy = speaker
          ? store.bot(speaker.botId)
          : threadId === group.threadId && group.busyBotId
            ? store.bot(group.busyBotId)
            : undefined;
        return {
          threadId,
          instance: busy ? runningTurnInstance(busy, threadId) : undefined,
        };
      });
      // Abort every queued operation before the first provider round trip, so none begins while Stop awaits.
      for (const { threadId } of interruptTargets) {
        cancelChannelMessages(group.id, threadId);
        cancelGroupTurnOperations(group.id, threadId);
      }
      for (const { threadId, instance } of interruptTargets) {
        revokeInternalCapabilitiesForThread(threadId);
        await instance?.adapter.interruptTurn(threadId).catch(() => {});
        closeOpenApprovals(threadId);
      }
      return json(res, 200, { ok: true });
    }
    return PASS;
  };
}
