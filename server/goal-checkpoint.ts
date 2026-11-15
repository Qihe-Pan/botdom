import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { holdsCredential, redactSecretsInText } from "../shared/redact.ts";
import { SECRET_FOLDER } from "./secret-folder.ts";
import type { GroupGoalCheckpoint, GroupGoalRunCardData } from "../shared/group-goal-run.ts";
import { parseGroupGoalDecision, type GoalStepResult, type GroupGoalDecision } from "./group-goal-run.ts";
import type { LiveGoalRun } from "./host/goal-cards.ts";
import type { Message, Store } from "./store.ts";

const transient = new Set(["busy", "activity", "unread", "updatedAt", "turnStartedAt", "lastThreadOrderAt", "resumeCursors", "tasks", "mainThreadId", "mainThreadChoice", "cacheKeepWarm", "usage"]);
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
export const goalCheckpointSettings = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value).filter(([key]) => !transient.has(key)));
export const goalCheckpointHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

export function createGoalCheckpointHasher(dataDir: string): (value: unknown) => string {
  let key: Buffer | undefined;
  return value => {
    if (!key) {
      const folder = join(dataDir, SECRET_FOLDER);
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const file = join(folder, "goal-checkpoint.key");
      try {
        const fresh = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
        try { writeFileSync(fresh, randomBytes(32)); } finally { closeSync(fresh); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const existing = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat = fstatSync(existing);
        if (!stat.isFile() || stat.size !== 32) throw new Error("The goal checkpoint key is unavailable; automatic dispatch is disabled.");
        key = readFileSync(existing);
      } finally { closeSync(existing); }
    }
    return createHmac("sha256", key).update(JSON.stringify(stable(value))).digest("hex");
  };
}

export interface GoalCheckpointScope {
  groupId: string; threadId: string; supervisorId: string; boardRevision: number; settingsHash: string; latestUserMessageId: string;
}
function checkpointHoldsSecrets(value: unknown): boolean {
  if (typeof value === "string") return holdsCredential(value) || redactSecretsInText(value) !== value;
  if (Array.isArray(value)) return value.some(checkpointHoldsSecrets);
  return Boolean(value && typeof value === "object" && Object.values(value).some(checkpointHoldsSecrets));
}

export function checkpointDecision(checkpoint: GroupGoalCheckpoint | undefined): GroupGoalDecision | undefined {
  if (!checkpoint || checkpoint.controlSource === "verification" || checkpoint.version !== 1 || typeof checkpoint.id !== "string" || !checkpoint.id || checkpoint.phase !== "planned" ||
      typeof checkpoint.createdAt !== "number" || !Number.isFinite(checkpoint.createdAt) || checkpoint.createdAt > Date.now() + 60_000 || Date.now() - checkpoint.createdAt > 30 * 60_000 ||
      typeof checkpoint.requestMessageId !== "string" || !checkpoint.requestMessageId || typeof checkpoint.plainMessage !== "boolean" ||
      typeof checkpoint.decisionText !== "string" || checkpoint.decisionText.length > 65_536 || !Number.isSafeInteger(checkpoint.turnCount) || checkpoint.turnCount < 1 ||
      !Array.isArray(checkpoint.followupMessageIds) || checkpoint.followupMessageIds.some(id => typeof id !== "string" || !id || id.length > 200)) return undefined;
  const decision = parseGroupGoalDecision(checkpoint.decisionText).decision;
  return decision?.status === "continue" && !checkpointHoldsSecrets(decision) && !checkpointHoldsSecrets(checkpoint.assignments) ? decision : undefined;
}
export function checkpointRestorable(card: GroupGoalRunCardData, scope: GoalCheckpointScope | undefined): boolean {
  const saved = card.checkpoint;
  return card.status === "working" && Boolean(scope && saved && checkpointDecision(saved) && saved.runId === card.runId && saved.turnCount === card.turnCount &&
    card.turnCount < card.maxTurns && saved.groupId === scope.groupId && saved.threadId === scope.threadId && saved.supervisorId === scope.supervisorId &&
    card.coordinatorBotId === scope.supervisorId && saved.boardRevision === scope.boardRevision && saved.settingsHash === scope.settingsHash && saved.latestUserMessageId === scope.latestUserMessageId);
}

export function createGoalCheckpoint(args: {
  store: Pick<Store, "messagesFor" | "patchMessage">; threadId: string; run: LiveGoalRun; scope(): GoalCheckpointScope | undefined; restored?: GroupGoalCheckpoint; request(): { messageId: string; plainMessage: boolean } | undefined; memberName?(id: string): string;
}) {
  const card = (): Message & { goalRun: GroupGoalRunCardData } => {
    const message = args.store.messagesFor(args.threadId).find(message => message.id === args.run.cardMessageId);
    if (!message?.goalRun || message.goalRun.runId !== args.run.runId || message.goalRun.status !== "working" || args.run.finished) throw new Error("This goal no longer permits automatic dispatch.");
    return message as Message & { goalRun: GroupGoalRunCardData };
  };
  const save = (checkpoint: GroupGoalCheckpoint) => {
    const current = card();
    if (!args.store.patchMessage(args.threadId, current.id, { goalRun: { ...current.goalRun, checkpoint } })) throw new Error("The goal checkpoint could not be saved.");
  };
  let plannedId = args.restored?.id;
  let localVerificationDecision = false;
  return {
    ...(args.restored ? { restored: { ran: true, outcome: "settled", replyText: args.restored.decisionText, followupMessageIds: args.restored.followupMessageIds } satisfies GoalStepResult } : {}),
    record(decision: GroupGoalDecision, result: GoalStepResult): void {
      if (decision.status !== "continue") throw new Error("Only an unstarted assignment decision can be checkpointed.");
      if (checkpointHoldsSecrets(decision)) throw new Error("The saved decision contains a credential. Nothing was dispatched; use the credential card and provide instructions without secrets.");
      const current = card();
      if (plannedId) {
        if (current.goalRun.checkpoint?.id !== plannedId || !checkpointRestorable(current.goalRun, args.scope())) throw new Error("The saved goal decision is no longer safe to dispatch.");
        return;
      }
      const request = args.request();
      if (!request?.messageId) throw new Error("The original goal request could not be verified.");
      const scope = args.scope();
      if (!scope) throw new Error("The goal dispatch context could not be verified.");
      const decisionText = `<openmaus-goal>${JSON.stringify(decision)}</openmaus-goal>`;
      if (decisionText.length > 65_536) throw new Error("The goal decision is too large to checkpoint safely.");
      const checkpoint: GroupGoalCheckpoint = { version: 1, id: randomUUID(), phase: "planned", runId: args.run.runId, turnCount: args.run.turnCount,
        ...(result.controlSource ? { controlSource: result.controlSource } : {}),
        ...scope, requestMessageId: request.messageId, plainMessage: request.plainMessage, decisionText, assignments: ("assignments" in decision ? decision.assignments : [decision]).map(item => ({ botId: item.next, name: args.memberName?.(item.next) ?? item.next, instruction: item.instruction })), followupMessageIds: result.followupMessageIds ?? [], createdAt: Date.now() };
      if (checkpointHoldsSecrets(checkpoint.assignments)) throw new Error("The saved decision contains a credential. Nothing was dispatched; use the credential card and provide instructions without secrets.");
      save(checkpoint); plannedId = checkpoint.id; localVerificationDecision = result.controlSource === "verification";
    },
    claim(): void {
      const current = card();
      const dispatchCard = localVerificationDecision && current.goalRun.checkpoint
        ? { ...current.goalRun, checkpoint: { ...current.goalRun.checkpoint, controlSource: undefined } } : current.goalRun;
      if (!plannedId || current.goalRun.checkpoint?.id !== plannedId || !checkpointRestorable(dispatchCard, args.scope())) throw new Error("The goal dispatch context changed; automatic dispatch was stopped.");
      save({ ...current.goalRun.checkpoint!, phase: "claimed" });
    },
    settled(): void {
      const current = card();
      if (!plannedId || current.goalRun.checkpoint?.id !== plannedId || current.goalRun.checkpoint.phase !== "claimed") throw new Error("The goal checkpoint changed during execution.");
      save({ ...current.goalRun.checkpoint, phase: "settled" }); plannedId = undefined; localVerificationDecision = false;
    },
  };
}
