/** Durable progress receipt for one goal-driven channel run. */
export type GroupGoalRunStatus =
  | "working"
  | "completed"
  | "needs-input"
  | "blocked"
  | "limit-reached"
  /** The operator (or a guard) parked the run. */
  | "paused"
  | "stopped"
  | "failed";

/** A user's follow-up stays attached to its original goal independently of transcript windows. */
export interface GroupGoalFollowup {
  messageId: string;
  text: string;
  receivedAt: number;
  /** Dispatched means a named employee execution started; it does not mean the work was completed or accepted. */
  state: "waiting" | "dispatched" | "answered" | "interrupted";
  /** The supervisor's acknowledgement; additional work can still be waiting. */
  replyMessageId?: string;
  executionIds?: string[];
}

export interface GroupGoalRunCardData {
  runId: string;
  goal: string;
  status: GroupGoalRunStatus;
  coordinatorBotId: string;
  coordinatorName: string;
  turnCount: number;
  maxTurns: number;
  detail?: string;
  startedAt: number;
  finishedAt?: number;
  followups?: GroupGoalFollowup[];
  checkpoint?: GroupGoalCheckpoint;
  verification?: GroupGoalVerification;
}

/** Host-run checks are bound to file hashes; a pass is not human acceptance or a proof of complete coverage. */
export interface GroupGoalVerification {
  phase: "reviewing" | "checking" | "passed" | "failed" | "invalid" | "blocked";
  attempt: number;
  sourceHash?: string;
  checksHash?: string;
  checkedAt: number;
  checkCount?: number;
  failures?: Array<{ id: string; requirement: string; detail: string; kind?: "failed" | "invalid" | "environment"; taskId?: string; files?: string[] }>;
  checksRevision?: number;
  detail?: string;
}

/** Only planned proves that no board dispatch or employee preparation has begun. Other phases require review after a restart. */
export interface GroupGoalCheckpoint {
  version: 1;
  id: string;
  phase: "planned" | "claimed" | "settled";
  controlSource?: "verification";
  runId: string;
  turnCount: number;
  groupId: string;
  threadId: string;
  supervisorId: string;
  boardRevision: number;
  settingsHash: string;
  latestUserMessageId: string;
  requestMessageId: string;
  plainMessage: boolean;
  decisionText: string;
  assignments: Array<{ botId: string; name: string; instruction: string }>;
  followupMessageIds: string[];
  createdAt: number;
}
