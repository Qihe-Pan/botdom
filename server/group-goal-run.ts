import { parseRoomTodoPlan, parseRoomTodoReference, type RoomTodoPlanEntry, type RoomTodoReference } from "../shared/room-todo.ts";
import type { GroupGoalRunStatus } from "../shared/group-goal-run.ts";
import type { GroupDefaultResponder } from "./store.ts";
import { verificationOwnedFiles, type GoalVerificationGate } from "./group-goal-verification.ts";
import { verificationRepairDecision, type GoalRepairTask } from "./group-goal-repair.ts";

export const GROUP_GOAL_MAX_TURNS = 13;
export const GROUP_GOAL_WAIT_MAX_MS = Math.max(1_000, Number(process.env.OMB_GOAL_WAIT_MAX_MS) || 30 * 60_000);
const GROUP_GOAL_MAX_WAIT_EXHAUSTIONS = 3;
export const GROUP_GOAL_CONTROL_OPEN = "<openmaus-goal>";
export const GROUP_GOAL_CONTROL_CLOSE = "</openmaus-goal>";

export interface GroupGoalAssignment { next: string; instruction: string; task?: string; existingTask?: RoomTodoReference; followupMessageIds?: string[]; files?: string[] }

export type GroupGoalDecision = (
  | ({ status: "continue"; detail?: string } & (GroupGoalAssignment | { assignments: GroupGoalAssignment[] }))
  | { status: "completed" | "needs-input" | "blocked"; detail: string }
) & { plan?: RoomTodoPlanEntry[]; answeredFollowupMessageIds?: string[]; verifyAfterBatch?: boolean };

export interface GoalRunMember {
  id: string;
  name: string;
  hidden?: boolean;
  chiefOfStaff?: boolean;
}

export interface ParsedGroupGoalDecision {
  visibleText: string;
  decision: GroupGoalDecision | null;
}

export function groupGoalCompletionTurnId(
  eventTurnId: string | undefined,
  boundTurnId: string | undefined,
): string | undefined {
  return eventTurnId ?? boundTurnId;
}

const bounded = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function visibleCoordinatorText(text: string): string {
  let visible = text;
  for (;;) {
    const closeAt = visible.indexOf(GROUP_GOAL_CONTROL_CLOSE);
    if (closeAt < 0) break;
    const openAt = visible.lastIndexOf(GROUP_GOAL_CONTROL_OPEN, closeAt);
    if (openAt < 0) {
      visible = `${visible.slice(0, closeAt)}${visible.slice(closeAt + GROUP_GOAL_CONTROL_CLOSE.length)}`;
      continue;
    }
    visible = `${visible.slice(0, openAt)}${visible.slice(closeAt + GROUP_GOAL_CONTROL_CLOSE.length)}`;
  }
  // Never expose a half-written control marker or JSON fragment.
  const danglingOpen = visible.indexOf(GROUP_GOAL_CONTROL_OPEN);
  if (danglingOpen >= 0) visible = visible.slice(0, danglingOpen);
  return visible.replaceAll(GROUP_GOAL_CONTROL_CLOSE, "").trim();
}

/** The last complete envelope wins, so a quoted example earlier in the reply cannot steer the run. */
export function parseGroupGoalDecision(text: string): ParsedGroupGoalDecision {
  const closeAt = text.lastIndexOf(GROUP_GOAL_CONTROL_CLOSE);
  const openAt = closeAt < 0 ? -1 : text.lastIndexOf(GROUP_GOAL_CONTROL_OPEN, closeAt);
  if (openAt < 0 || closeAt < 0) return { visibleText: visibleCoordinatorText(text), decision: null };

  const visibleText = visibleCoordinatorText(text);
  const payload = text.slice(openAt + GROUP_GOAL_CONTROL_OPEN.length, closeAt).trim();
  try {
    const raw = JSON.parse(payload) as Record<string, unknown>;
    const status = raw.status;
    const detail = bounded(raw.detail, 500);
    const parsedPlan = parseRoomTodoPlan(raw.plan);
    const answered = Array.isArray(raw.answeredFollowupMessageIds)
      ? raw.answeredFollowupMessageIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200) : [];
    const plan = { ...(parsedPlan.length ? { plan: parsedPlan } : {}), ...(answered.length ? { answeredFollowupMessageIds: [...new Set(answered)] } : {}) };
    if (status === "continue") {
      if (raw.verifyAfterBatch !== undefined && typeof raw.verifyAfterBatch !== "boolean") return { visibleText, decision: null };
      const verification = raw.verifyAfterBatch === true ? { verifyAfterBatch: true } : {};
      const parseAssignment = (value: unknown): GroupGoalAssignment | null => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const item = value as Record<string, unknown>;
        const next = bounded(item.next, 100);
        const instruction = bounded(item.instruction, 2_000);
        const task = bounded(item.task, 40).replace(/\s+/g, " ");
        const existingTask = parseRoomTodoReference(item.existingTask);
        const files = item.files === undefined ? undefined : verificationOwnedFiles(item.files);
        if (item.files !== undefined && !files) return null;
        if (item.existingTask !== undefined && (!existingTask || item.task !== undefined)) return null;
        if (item.followupMessageIds !== undefined && (!Array.isArray(item.followupMessageIds) || item.followupMessageIds.some(id => typeof id !== "string" || !id || id.length > 200))) return null;
        const followupMessageIds = Array.isArray(item.followupMessageIds) ? [...new Set(item.followupMessageIds as string[])] : [];
        return next && instruction ? { next, instruction, ...(files ? { files } : {}), ...(task ? { task } : {}), ...(existingTask ? { existingTask } : {}), ...(followupMessageIds.length ? { followupMessageIds } : {}) } : null;
      };
      if (raw.assignments !== undefined) {
        if (!Array.isArray(raw.assignments) || !raw.assignments.length || raw.assignments.length > 4) return { visibleText, decision: null };
        const assignments = raw.assignments.map(parseAssignment);
        if (assignments.some(item => !item)) return { visibleText, decision: null };
        return { visibleText, decision: { status, assignments: assignments as GroupGoalAssignment[], ...(detail ? { detail } : {}), ...plan, ...verification } };
      }
      const assignment = parseAssignment(raw);
      return { visibleText, decision: assignment ? { status, ...assignment, ...(detail ? { detail } : {}), ...plan, ...verification } : null };
    }
    if (status === "completed" || status === "needs-input" || status === "blocked") {
      if (!detail) return { visibleText, decision: null };
      return { visibleText, decision: { status, detail, ...plan } };
    }
  } catch {
  }
  return { visibleText, decision: null };
}

/** A goal run never recruits somebody outside the room. */
export function selectGroupGoalCoordinator<Member extends GoalRunMember>(
  members: Member[],
  responder: GroupDefaultResponder,
): Member | null {
  const active = members.filter((member) => !member.hidden);
  const lead = responder.kind === "member" ? responder.botId : responder.kind === "auto" ? responder.fallbackBotId : undefined;
  if (lead) {
    const explicit = active.find((member) => member.id === lead);
    if (explicit) return explicit;
  }
  return active.find((member) => member.chiefOfStaff) ?? active[0] ?? null;
}

export function resolveGroupGoalMember(reference: string, members: GoalRunMember[]): GoalRunMember | null {
  const wanted = reference.trim().replace(/^@/, "").toLocaleLowerCase();
  if (!wanted) return null;
  const active = members.filter((member) => !member.hidden);
  const idMatch = active.find((member) => member.id.toLocaleLowerCase() === wanted);
  if (idMatch) return idMatch;
  const nameMatches = active.filter((member) => member.name.toLocaleLowerCase() === wanted);
  return nameMatches.length === 1 ? nameMatches[0]! : null;
}

/** `solo` is a room of one: the lead does the work in its own turns, and "continue" names itself for its next turn. */
export function groupGoalCoordinatorInstructions(args: {
  goal: string;
  members: GoalRunMember[];
  turn: number;
  maxTurns: number;
  remainingTurns: number;
  note?: string;
  solo?: boolean;
  /** The room's task board, rendered by `roomTodoLedger`; present when the run keeps one. */
  ledger?: string;
  /** The run started from a plain room message, which may be conversation rather than work. */
  plainMessage?: boolean;
}): string {
  const active = args.members.filter((member) => !member.hidden);
  const roster = active
    .map((member) => `${member.name} (${member.id})`)
    .join(", ");
  const self = args.solo ? active[0] : undefined;
  return [
    self ? "You are working alone toward a bounded goal." : "You are the lead coordinator for a bounded team goal run.",
    `Goal: ${args.goal}`,
    "When assigning, name the input files and shared notes needed, and the exact paths the goal or project uses. Work edits files in place where the goal or project keeps them, the project's own tests included; only a standalone output with no place in the project goes in deliverables/<task id>/, and you attach them in the reply. Scratch and intermediate files go in .work/; do not attach them. When reviewing a report, verify its deliverable exists in the working folder and file registry. Before completing a code goal, require successful checks on the current combined result. Use the host's fingerprinted execution receipt when available; do not rerun the same commands in another model turn merely to restate them. Without host evidence, run the combined checks yourself. Failed checks prevent completion. Record important decisions in shared notes/decisions.md and update shared notes/summary.md with a concise user-facing summary when the goal finishes.",
    "For code delivery, keep a short requirement-to-evidence checklist in shared notes. Require independent coverage of the highest-risk requirement across component boundaries, not only tests written by its implementer. The early host gate authors and runs this coverage; review its scope and add a check only for a concrete missing requirement. Where persistence or external writes matter, include a failed operation followed by retry, shutdown and recovery, and a failure of the recovery step itself; verify rejected work cannot become successful state later. Use isolated data and bounded fault injection. Return concrete failures for repair; the host reruns affected and combined checks, with final integration review kept separate. State any unverified requirement explicitly; passing test counts alone do not prove full coverage. Keep this evidence in the work artifacts and the final report concise.",
    "Before implementation, settle the shared interfaces, critical consistency rules and bounded failure model in notes/decisions.md. Review the risky design before delegating it. Split by independent deliverables and dependencies, not by the number of available employees; do not force equal task counts when complexity differs.",
    'For code assignments declare "files": ["relative/source.ts", "relative/source.test.ts", "notes/owner-evidence.md"] with exact non-overlapping owned paths (no globs). When this batch plus existing deliveries should cover the whole goal, set "verifyAfterBatch": true. The host then authors independent checks before your next review, executes them and routes proven failures to their original task owners. Leave it false for prerequisite-only batches. Do not spend repeated supervisor turns inventing a second full suite before this gate.',
    "After host verification, review the requirement coverage, critical design and integration changes using saved evidence. Do not recreate passed checks or expand the fault model merely to keep reviewing. A newly discovered requirement violation still needs a concrete check; an optional strengthening must be labelled separately. Repeated failure of the same check requires a design decision, not another identical assignment. Host test results are evidence, not human acceptance.",
    ...(self ? [] : [`Available room members: ${roster}.`]),
    `This is ${self ? "" : "team "}turn ${args.turn} of ${args.maxTurns}; ${args.remainingTurns} turn(s) remain after this one.`,
    ...(args.note ? [`Harness note: ${args.note}`] : []),
    ...(args.plainMessage && args.turn === 1
      ? ["The goal is the person's latest room message. If it is a greeting, a quick question or conversation you can answer yourself, answer it directly and use status \"completed\" with no plan."]
      : []),
    ...(args.ledger !== undefined && !self
      ? [
          args.ledger,
          'For new work use an optional "plan" array: [{"id":"t1","title":"Short task, max 40 chars","assignee":"member id","status":"todo|review_ok|returned|blocked|cancelled","note":"optional"}]. An id in this plan is a short alias for the current goal. Reuse the alias only for the same work within this goal. In its assignment set "task" to that alias.',
          'To continue an existing board item (including a person’s returned or unassigned task), use "existingTask":{"id":"exact board id","title":"exact full board title"} in the assignment and omit "task". A narrower instruction can be a step of that item. To review or return that existing item, use the same existingTask reference in plan instead of id. Do not choose a historical item just because its number matches. Never reopen an accepted or cancelled item yourself.',
          'After a teammate reports, check the result and mark the item review_ok, or returned with a note and reassign it. Only send plan entries that are new or changed.',
          "Write the human-facing update in the person's language.",
        ]
      : []),
    self
      ? "Use the conversation as the progress ledger. Do the next concrete piece of work now, then decide whether the goal is genuinely complete, needs the human, is blocked, or needs another turn."
      : "Use the task board and current batch reports as the progress ledger. Earlier conversation is not replayed after initial planning; keep durable interface decisions and evidence in the shared context index and named topic documents. Decide whether the goal is genuinely complete, needs the human, is blocked, or needs one or more named teammates next.",
    ...(!self ? [
      'For a divisible goal, first create multiple task board items with independent owners and concrete deliverables. Dispatch independent work together using "assignments": [{"next":"employee id","task":"t1","instruction":"Deliverable and checks"}, ...]. Use distinct employees, at most 4 per batch. Dispatch dependent tasks after their prerequisites report. Summarize all reports after the batch finishes.',
      'Each employee turn costs one turn. Leave at least one turn for your final summary. The single next/task/instruction format remains supported.',
    ] : []),
    "Do not continue merely to generate discussion. Do not claim completion unless the requested deliverable or answer is present in the conversation.",
    "For routine dispatch or internal progress, do not narrate an update: output only the private control envelope. Answer the person's questions and give a concise human-facing message when work completes, a material blocker arises, or their decision is needed. Then end with exactly one private control envelope on its own line.",
    self
      ? `${GROUP_GOAL_CONTROL_OPEN}{"status":"continue","next":"${self.id}","instruction":"Your next step","detail":"Short progress note"}${GROUP_GOAL_CONTROL_CLOSE}`
      : args.ledger !== undefined
        ? `${GROUP_GOAL_CONTROL_OPEN}{"status":"continue","plan":[{"id":"t1","title":"First deliverable","assignee":"first employee id"},{"id":"t2","title":"Independent deliverable","assignee":"second employee id"}],"assignments":[{"next":"first employee id","task":"t1","instruction":"Concrete first deliverable and checks"},{"next":"second employee id","task":"t2","instruction":"Concrete independent deliverable and checks"}],"detail":"Short progress note"}${GROUP_GOAL_CONTROL_CLOSE}`
        : `${GROUP_GOAL_CONTROL_OPEN}{"status":"continue","next":"Exact member id from the roster","instruction":"Concrete next assignment","detail":"Short progress note"}${GROUP_GOAL_CONTROL_CLOSE}`,
    `Or use status "completed", "needs-input", or "blocked" with a non-empty "detail" and omit next/instruction.`,
    "Never mention, quote, or explain the control envelope in your human-facing text.",
  ].join("\n");
}

export function groupGoalWorkerInstructions(args: {
  goal: string;
  coordinatorName: string;
  assignment: string;
  files?: string[];
  turn: number;
  maxTurns: number;
}): string {
  return [
    `You are a specialist contributing to a bounded team goal run led by ${args.coordinatorName}.`,
    `Goal: ${args.goal}`,
    `Your assignment: ${args.assignment}`,
    `This is team turn ${args.turn} of ${args.maxTurns}.`,
    "Your input contains this assignment and, when available, your previous verified delivery checkpoint for this task. Other employees' histories are not replayed. Use the named contract and input files; do not reread their whole implementation unless your task actually depends on it. Record deliverable paths, interface changes, actual checks and remaining gaps in your concise report; keep detailed logs in files.",
    ...(args.files?.length ? [`Owned files: ${JSON.stringify(args.files)}. If a repair requires changing another task's files or the agreed interface, report the design blocker instead of silently expanding ownership.`] : []),
    "Do the assigned work now and put concrete results, evidence, or a clear blocker in your reply.",
    "Keep interim chat updates to material changes or blockers; do not narrate routine steps. Give one concise final report when the work settles.",
    `Address your result to ${args.coordinatorName}. Do not invent a new orchestration protocol or emit an openmaus-goal control envelope.`,
  ].join("\n");
}

export function groupGoalAssignmentKey(memberId: string, instruction: string): string {
  return `${memberId}:${instruction.trim().toLocaleLowerCase().replace(/\s+/g, " ")}`;
}

export type GoalStepOutcome =
  | "settled"
  | "provider_failed"
  | "dispatch_failed"
  | "spend_capped"
  | "quota_exhausted"
  | "stalled"
  | "timed_out"
  | "cancelled"
  | "busy"
  | "parked"
  | "unavailable";

export interface GoalStepResult {
  ran: boolean;
  replyText: string;
  providerTurnId?: string;
  boardPlanRefused?: boolean;
  outcome?: GoalStepOutcome;
  stopReason?: string | null;
  followupMessageIds?: string[];
  controlSource?: "verification";
}

export type GoalRunEnd = Exclude<GroupGoalRunStatus, "working">;

/** The room's task board as the run sees it; absent for one-on-one chats. */
export interface GoalRunBoard {
  ledger(): string;
  plainMessage?: boolean;
  plan(entries: RoomTodoPlanEntry[]): void;
  orderAssignments?(assignments: GroupGoalAssignment[]): GroupGoalAssignment[];
  repairReference?(todoId: string, workerId: string): RoomTodoReference | undefined;
  /** The board item this assignment works on, created when the supervisor named none. */
  assign(task: string | undefined, workerId: string, instruction: string, existingTask?: RoomTodoReference): string;
  dispatch?(entries: RoomTodoPlanEntry[], assignments: BoardAssignment[]): string[];
  reported(todoId: string, workerId: string, providerTurnId?: string): void | boolean;
  unfinished(todoId: string, status: "todo" | "blocked", reason: string): void;
}

export interface BoardAssignment { workerId: string; instruction: string; task?: string; existingTask?: RoomTodoReference }

/** A batch result stays intact until the next turn can verify its archived message. */
export interface GoalReport { botId?: string; todoId?: string; name: string; text: string }

export interface GoalRunDeps<Bot extends GoalRunMember> {
  run: { goal: string; turnCount: number; maxTurns: number; finished: boolean };
  coordinator: Bot;
  members: readonly Bot[];
  solo?: boolean;
  supervisorId?: string;
  mentionedAssignments?(text: string): GroupGoalAssignment[];
  cancelled(): boolean;
  /** The member as the store has it now. */
  current(botId: string): Bot | undefined;
  /** One member turn; a step counts against the run's turns once its member is claimed. */
  step(bot: Bot, coordinator: boolean, instructions: string, followupMessageIds?: string[], reports?: GoalReport[]): Promise<GoalStepResult>;
  /** The host can project verified reports from the actual conversation at dispatch time. */
  reportCheckpoint?: boolean;
  verification?: GoalVerificationGate;
  verificationReserveTurns?: number;
  finish(status: GoalRunEnd, detail: string): void;
  progress(detail: string): void;
  /** An activity row in the conversation, from the coordinator. */
  note(text: string): void;
  board?: GoalRunBoard;
  checkpoint?: {
    restored?: GoalStepResult;
    record(decision: GroupGoalDecision, result: GoalStepResult): void;
    claim(): void;
    settled(): void;
  };
  followups?: {
    answer(messageIds: string[]): void;
    waiting(): boolean;
    /** Return follow-ups from unsuccessful assignments to the coordinator. */
    retry?(messageIds: string[]): void;
  };
}

/** The goal run loop, the same for a room and a one-on-one chat (a room of one). */
export async function runGoalRun<Bot extends GoalRunMember>(deps: GoalRunDeps<Bot>): Promise<void> {
  const { run, coordinator } = deps;
  const assignmentCounts = new Map<string, number>();
  const assignmentReports = new Map<string, string>();
  const goalMembers: GoalRunMember[] = deps.members.map((member) => ({
    id: member.id,
    name: member.name,
    hidden: member.hidden,
    chiefOfStaff: member.chiefOfStaff,
  }));

  let restored = deps.checkpoint?.restored;
  let coordinatorNote: string | undefined;
  let coordinatorReports: GoalReport[] | undefined;
  let waitExhaustions = 0;
  let delegated = false;
  let automaticDecision: GroupGoalDecision | undefined;
  let repairFiles: Set<string> | undefined;
  const repairTasks = new Map<string, GoalRepairTask>();
  const failureOccurrences = new Map<string, number>();
  const requiresVerification = () => (delegated || !deps.board?.plainMessage) && deps.verification?.required();
  const reserveVerificationTurns = () => {
    const extra = deps.verificationReserveTurns;
    if (run.maxTurns !== GROUP_GOAL_MAX_TURNS || !extra || !Number.isInteger(extra) || extra < 1) return false;
    run.maxTurns += Math.min(13, extra);
    return true;
  };
  while (!deps.cancelled() && run.turnCount < run.maxTurns) {
    const coordinatorTurn = run.turnCount + 1;
    const note = coordinatorNote;
    const reportsForTurn = coordinatorReports;
    coordinatorNote = undefined;
    coordinatorReports = undefined;
    const automatic = automaticDecision && !deps.followups?.waiting();
    const coordinatorResult: GoalStepResult = automatic ? { ran: true, outcome: "settled", controlSource: "verification",
      replyText: `${GROUP_GOAL_CONTROL_OPEN}${JSON.stringify(automaticDecision)}${GROUP_GOAL_CONTROL_CLOSE}` } : restored ?? await deps.step(coordinator, true, groupGoalCoordinatorInstructions({
      goal: run.goal,
      members: goalMembers,
      turn: coordinatorTurn,
      maxTurns: run.maxTurns,
      remainingTurns: run.maxTurns - coordinatorTurn,
      note,
      solo: deps.solo,
      ...(deps.board ? { ledger: deps.board.ledger(), plainMessage: deps.board.plainMessage } : {}),
    }), undefined, reportsForTurn);
    automaticDecision = undefined;
    if (!automatic) repairFiles = undefined;
    restored = undefined;
    if (deps.cancelled()) return;
    if (coordinatorResult.outcome === "unavailable") {
      deps.finish("blocked", `${coordinator.name} is not available.`);
      return;
    }
    if (coordinatorResult.outcome === "spend_capped" || coordinatorResult.outcome === "quota_exhausted") {
      deps.finish("blocked", coordinatorResult.stopReason ?? `${coordinator.name} hit the workspace spend cap.`);
      return;
    }
    if (coordinatorResult.outcome === "busy") {
      deps.finish("blocked", `${coordinatorResult.stopReason ?? `${coordinator.name} stayed busy`} — send the goal again when they are free.`);
      return;
    }
    if (coordinatorResult.outcome === "parked") {
      deps.finish(
        "blocked",
        `${coordinatorResult.stopReason ?? `${coordinator.name} parked waiting for the computer`} — send the goal again when the computer is free.`,
      );
      return;
    }
    if (!coordinatorResult.ran || coordinatorResult.outcome !== "settled") {
      const reason = coordinatorResult.stopReason?.trim().slice(0, 120);
      deps.finish("failed", `${coordinator.name} could not complete the coordination step${reason ? ` — ${reason}` : ""}. Check the workspace and any external effects before asking to continue; the failed step was not automatically repeated.`);
      return;
    }

    const parsedDecision = parseGroupGoalDecision(coordinatorResult.replyText).decision;
    const mentions = !parsedDecision && !coordinatorResult.boardPlanRefused && deps.supervisorId === coordinator.id
      ? deps.mentionedAssignments?.(coordinatorResult.replyText) : undefined;
    const decision: GroupGoalDecision | null = mentions?.length ? { status: "continue", assignments: mentions.slice(0, 4) }
      : parsedDecision ?? (deps.board?.plainMessage && delegated && requiresVerification()
        ? { status: "completed", detail: `${coordinator.name} answered after delegated work.` } : null);
    if (!decision && deps.board?.plainMessage) {
      if (deps.followups?.waiting()) {
        deps.finish("needs-input", "Follow-up messages still await an answer or an actual employee assignment.");
        return;
      }
      deps.finish("completed", `${coordinator.name} answered directly.`);
      return;
    }
    if (!decision) {
      deps.finish("blocked", `${coordinator.name} did not provide a valid next-step decision.`);
      return;
    }
    const answerFollowups = () => deps.followups?.answer((decision.answeredFollowupMessageIds ?? []).filter(id => coordinatorResult.followupMessageIds?.includes(id)));
    const proposedCount = decision.status === "continue" ? ("assignments" in decision ? decision.assignments.length : 1) : 0;
    const noImplementationTurns = run.turnCount >= run.maxTurns
      || (decision.status === "continue" && run.maxTurns - run.turnCount < proposedCount + 1);
    if ((decision.status === "continue" || decision.status === "blocked") && noImplementationTurns
      && requiresVerification() && reserveVerificationTurns()) {
      answerFollowups();
      deps.progress("The implementation budget is exhausted; independent checks and bounded repair use the reserved turns.");
      const result = await deps.verification!.verify({ canReview: true, tasks: [...repairTasks.values()] });
      if (deps.cancelled()) return;
      if (result.status === "blocked") { deps.finish("blocked", result.detail); return; }
      coordinatorNote = result.status === "failed" ? result.detail
        : `${result.detail} The previous development phase was unfinished. Resolve or explain its remaining blocker and review the deliverables before proposing completion. Do not claim human acceptance.`;
      continue;
    }
    if (decision.status !== "continue") {
      answerFollowups();
      if (decision.status === "completed" && deps.followups?.waiting()) {
        deps.finish("needs-input", "Follow-up messages still await an answer or an actual employee assignment.");
        return;
      }
      let verified = "";
      if (decision.status === "completed" && requiresVerification()) {
        reserveVerificationTurns();
        deps.progress("The completion claim is awaiting independent checks.");
        const result = await deps.verification!.verify({ canReview: run.turnCount < run.maxTurns, tasks: [...repairTasks.values()] });
        if (deps.cancelled()) return;
        if (result.status === "blocked") { deps.finish("blocked", result.detail); return; }
        if (result.status === "failed") {
          coordinatorNote = result.detail;
          deps.progress("Independent checks found a failure; the team must repair and recheck it.");
          continue;
        }
        if (deps.followups?.waiting()) {
          coordinatorNote = "New user requirements arrived during verification. Handle them before proposing completion; independent checks will run again.";
          continue;
        }
        verified = ` ${result.detail}`;
      }
      try { if (decision.plan) deps.board?.plan(decision.plan); }
      catch (error) {
        deps.finish("blocked", error instanceof Error ? error.message : "The task board update failed.");
        return;
      }
      deps.finish(decision.status, decision.detail + verified);
      return;
    }
    if (run.turnCount >= run.maxTurns) break;

    const proposed = "assignments" in decision ? decision.assignments : [decision];
    const assignments = deps.board?.orderAssignments?.(proposed) ?? proposed;
    const parallel = assignments.length > 1;
    if (parallel && (deps.solo || deps.supervisorId !== coordinator.id)) {
      deps.finish("blocked", "Only this room's supervisor can dispatch parallel employee assignments.");
      return;
    }
    const batch: { assignment: GroupGoalAssignment; bot: Bot; todoId?: string }[] = [];
    for (const assignment of assignments) {
      if (assignment.followupMessageIds?.some(id => !coordinatorResult.followupMessageIds?.includes(id))) {
        deps.finish("blocked", "The assignment references a follow-up outside this coordinator turn.");
        return;
      }
      const worker = resolveGroupGoalMember(assignment.next, goalMembers);
      const workerBot = worker && deps.current(worker.id);
      if (!workerBot || workerBot.hidden || (parallel && workerBot.id === coordinator.id)) {
        deps.finish("blocked", "The supervisor selected an unavailable employee.");
        return;
      }
      if (batch.some(item => item.bot.id === workerBot.id)) {
        deps.finish("blocked", "A batch can assign only one task per employee.");
        return;
      }
      const key = groupGoalAssignmentKey(workerBot.id, assignment.instruction);
      const repeated = (assignmentCounts.get(key) ?? 0) + 1;
      assignmentCounts.set(key, repeated);
      if (repeated >= 3) {
        deps.finish("blocked", "The team repeated the same assignment three times without resolving the goal.");
        return;
      }
      batch.push({ assignment, bot: workerBot });
    }
    if (deps.solo && batch[0]?.bot.id === coordinator.id) {
      coordinatorNote = `Your next step: ${batch[0].assignment.instruction}`;
      continue;
    }
    if (run.maxTurns - run.turnCount < batch.length + 1) break;
    try {
      deps.checkpoint?.record({ ...decision, assignments: batch.map(item => ({ ...item.assignment, next: item.bot.id })) }, coordinatorResult);
      deps.checkpoint?.claim();
      if (deps.board?.dispatch) {
        const ids = deps.board.dispatch(decision.plan ?? [], batch.map(({ assignment, bot }) => ({
          workerId: bot.id, instruction: assignment.instruction, task: assignment.task, existingTask: assignment.existingTask,
        })));
        batch.forEach((item, index) => { item.todoId = ids[index]; });
      } else {
        if (decision.plan) deps.board?.plan(decision.plan);
        for (const item of batch) item.todoId = deps.board?.assign(item.assignment.task, item.bot.id, item.assignment.instruction, item.assignment.existingTask);
      }
    } catch (error) {
      deps.finish("blocked", error instanceof Error ? error.message : "The task board assignment failed.");
      return;
    }
    answerFollowups();
    for (const item of batch) if (item.todoId) {
      if (item.assignment.files?.length) repairTasks.set(item.todoId, { id: item.todoId, workerId: item.bot.id, files: item.assignment.files, assignment: item.assignment });
      else repairTasks.delete(item.todoId);
    }
    const firstTurn = run.turnCount + 1;
    delegated = true;
    const results = await Promise.all(batch.map(async (item, index) => {
      let result: GoalStepResult;
      try {
        result = await deps.step(item.bot, false, groupGoalWorkerInstructions({
          goal: run.goal, coordinatorName: coordinator.name, assignment: item.assignment.instruction,
          files: item.assignment.files,
          turn: firstTurn + index, maxTurns: run.maxTurns,
        }), item.assignment.followupMessageIds);
      } catch (error) {
        result = { ran: false, replyText: "", outcome: "dispatch_failed", stopReason: error instanceof Error ? error.message : String(error) };
      }
      const cancelled = deps.cancelled();
      try {
        if (item.todoId) {
          if (cancelled || result.outcome === "cancelled") deps.board?.unfinished(item.todoId, "todo", result.stopReason ?? "stopped");
          else if (result.ran && result.outcome === "settled" && result.replyText.trim()) {
            if (deps.board?.reported(item.todoId, item.bot.id, result.providerTurnId) === false) {
              result = { ...result, outcome: "unavailable", replyText: "", stopReason: "The execution has no verified archived report." };
            }
          }
          else deps.board?.unfinished(item.todoId, result.outcome === "busy" || result.outcome === "parked" ? "todo" : "blocked", result.stopReason?.trim() || `${item.bot.name} returned no result`);
        }
      } catch (error) {
        let reason = `Task board update failed: ${error instanceof Error ? error.message : String(error)}`;
        try { if (item.todoId) deps.board?.unfinished(item.todoId, cancelled ? "todo" : "blocked", reason); }
        catch { reason += "; the task status could not be updated"; }
        result = { ...result, outcome: "dispatch_failed", replyText: "", stopReason: reason };
      }
      return { ...result, cancelled };
    }));
    if (deps.cancelled()) return;
    try { deps.checkpoint?.settled(); }
    catch (error) { deps.finish("blocked", error instanceof Error ? error.message : "The goal checkpoint could not be settled."); return; }
    const unfinishedFollowups = new Set<string>();
    for (const [index, result] of results.entries()) {
      if (!result.cancelled && result.ran && result.outcome === "settled" && result.replyText.trim()) continue;
      for (const id of batch[index]?.assignment.followupMessageIds ?? []) unfinishedFollowups.add(id);
    }
    if (!deps.cancelled() && unfinishedFollowups.size) deps.followups?.retry?.([...unfinishedFollowups]);
    const reports: GoalReport[] = [];
    let unchangedReports = 0;
    let terminal: { status: GoalRunEnd; detail: string } | undefined;
    for (const [index, result] of results.entries()) {
      const { bot, assignment } = batch[index]!;
      if (result.cancelled) continue;
      if (result.ran && result.outcome === "settled" && result.replyText.trim()) {
        const key = JSON.stringify([groupGoalAssignmentKey(bot.id, assignment.instruction), assignment.existingTask?.id ?? assignment.task ?? null]);
        const report = result.replyText.trim().replace(/\s+/g, " ");
        if (!assignment.followupMessageIds?.length && assignmentReports.get(key) === report) unchangedReports++;
        assignmentReports.set(key, report);
        reports.push({ botId: bot.id, todoId: batch[index]!.todoId, name: bot.name, text: result.replyText });
        continue;
      }
      const reason = result.stopReason?.trim() || `${bot.name} returned no result`;
      const waiting = result.outcome === "busy" || result.outcome === "parked";
      reports.push({ name: bot.name, text: `${waiting ? "waiting" : "blocked"}: ${reason} (assignment: ${assignment.instruction})` });
      if (result.outcome === "quota_exhausted" || result.outcome === "spend_capped") {
        terminal = { status: "blocked", detail: reason };
      } else if (waiting) {
        waitExhaustions += 1;
        if (waitExhaustions >= GROUP_GOAL_MAX_WAIT_EXHAUSTIONS) terminal = { status: "blocked", detail: `Teammates stayed busy past the wait limit ${waitExhaustions} times — try again when the team is free.` };
        deps.note(`${reason} — asking ${coordinator.name} to reassign`);
        deps.progress(`${reason}. ${coordinator.name} is reassigning.`);
      } else {
        terminal = { status: "blocked", detail: `${bot.name} could not return a verified result — ${reason}. Check the workspace and any external effects before asking to continue; the failed assignment was not automatically repeated.` };
      }
    }
    if (deps.cancelled()) return;
    if (terminal) { deps.finish(terminal.status, terminal.detail); return; }
    if (unchangedReports === batch.length && !deps.followups?.waiting()) {
      deps.finish("blocked", "The same assignments returned unchanged reports. Send new information or instructions to continue.");
      return;
    }
    coordinatorNote = "All assignments in this batch have settled. Review all reports once and reassign unfinished work if needed.";
    if (decision.verifyAfterBatch && reports.length === batch.length && reports.every(report => report.todoId && report.botId)
      && requiresVerification() && !deps.followups?.waiting()) {
      reserveVerificationTurns();
      deps.progress("The implementation batch is ready for independent host checks.");
      const checked = await deps.verification!.verify({ canReview: run.turnCount < run.maxTurns, tasks: [...repairTasks.values()] });
      if (deps.cancelled()) return;
      if (checked.status === "blocked") { deps.finish("blocked", checked.detail); return; }
      coordinatorNote = checked.detail;
      const outside = repairFiles && checked.changedFiles?.filter(file => !repairFiles!.has(file));
      if (outside?.length) coordinatorNote += `\nDesign review required: the repair changed files outside its declared ownership: ${JSON.stringify(outside)}. Reconcile these changes before completing or assigning more work.`;
      else if (checked.status === "failed" && !deps.followups?.waiting()) {
        const repair = verificationRepairDecision({ result: checked, tasks: [...repairTasks.values()], occurrences: failureOccurrences,
          reference: task => deps.board?.repairReference?.(task.id, task.workerId) });
        coordinatorNote += `\n${repair.reason}`;
        if (repair.decision) {
          automaticDecision = repair.decision;
          repairFiles = new Set(("assignments" in repair.decision ? repair.decision.assignments : []).flatMap(item => item.files ?? []));
          deps.progress(repair.reason);
        }
      }
    }
    if (deps.reportCheckpoint) coordinatorReports = reports;
    else coordinatorNote += `\n${reports.map(report => `${report.name}: ${report.text}`).join("\n")}`;
  }

  if (!deps.cancelled() && !run.finished) {
    deps.finish("limit-reached", `Paused at the ${run.maxTurns}-turn safety limit. Send the goal again to continue with a fresh bounded run.`);
  }
}
