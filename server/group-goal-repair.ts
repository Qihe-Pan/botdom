import type { RoomTodoReference } from "../shared/room-todo.ts";
import type { GroupGoalAssignment, GroupGoalDecision } from "./group-goal-run.ts";
import type { GoalVerificationResult, GoalVerificationTask } from "./group-goal-verification.ts";

export interface GoalRepairTask extends GoalVerificationTask {
  assignment: GroupGoalAssignment;
}

export function verificationRepairDecision(args: {
  result: GoalVerificationResult;
  tasks: readonly GoalRepairTask[];
  occurrences: Map<string, number>;
  reference(task: GoalRepairTask): RoomTodoReference | undefined;
}): { decision?: GroupGoalDecision; reason: string } {
  const failures = args.result.failures;
  if (args.result.status !== "failed" || !failures?.length || !args.result.feedbackFile) return { reason: args.result.detail };
  if (failures.some(check => check.kind !== "failed")) return { reason: "The verification method or environment needs review, not product repair." };
  const targeted = failures.filter(check => check.id !== "combined");
  if (!targeted.length || targeted.some(check => !check.taskId || !check.files?.length)) return { reason: "A failure has no unambiguous task ownership. Review the evidence and interfaces." };
  const selected = args.tasks.filter(task => targeted.some(check => check.taskId === task.id));
  if (targeted.some(check => !selected.some(task => task.id === check.taskId && check.files!.every(file => task.files.includes(file))))) return { reason: "The failure refers to an unknown task or files outside its ownership." };
  if (new Set(selected.map(task => task.workerId)).size !== selected.length) return { reason: "Several failed tasks share an employee; the supervisor must order the repairs." };
  if (selected.some(task => task.files.some(file => args.tasks.some(other => other.id !== task.id && other.files.includes(file))))) return { reason: "Overlapping file ownership requires an integration decision." };
  const assignments: GroupGoalAssignment[] = [];
  const keys: string[] = [];
  for (const task of selected) {
    const reference = args.reference(task);
    if (!reference) return { reason: "Task ownership or status changed after verification. Reconcile the board before repairing." };
    const checks = targeted.filter(check => check.taskId === task.id);
    for (const check of checks) {
      const key = `${task.id}:${check.id}`;
      if ((args.occurrences.get(key) ?? 0) >= 1) return { reason: `Design review required: ${check.id} still fails after its automatic repair. Reconsider the design and scope before assigning more work; do not weaken the frozen check.` };
      keys.push(key);
    }
    assignments.push({ next: task.workerId, existingTask: reference, files: task.files,
      instruction: `Automatic verification repair for your existing task. Preserve its original requirements and interfaces. Read the host evidence at ${args.result.feedbackFile}; fix check IDs ${checks.slice(0, 10).map(check => check.id).join(", ")}, using your own delivery checkpoint. Source fingerprint: ${args.result.sourceHash ?? "see evidence"}. Reproduce the exact failures before editing. Edit only the owned files listed by the host. Do not edit frozen checks, another task's files, or expand the contract. If the fix requires any such change, report that blocker without making it. Run affected component tests and report actual results, changed files and remaining risks. The host will rerun independent and combined checks.` });
  }
  if (!assignments.length) return { reason: "No proven repair owner is available." };
  for (const key of keys) args.occurrences.set(key, (args.occurrences.get(key) ?? 0) + 1);
  return { decision: { status: "continue", assignments, verifyAfterBatch: true }, reason: "Host verification routed proven failures to their original owners." };
}
