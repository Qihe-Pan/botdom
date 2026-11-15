import {
  CheckCircle2,
  CircleAlert,
  Hand,
  Loader2,
  Square,
  XCircle,
} from "lucide-react";

import { ExecutionDetail } from "./ExecutionDetail";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { roomGoalTitle } from "@/lib/room-threads";
import { useStore, type Message } from "@/state/store";
import type { GroupGoalRunCardData } from "../../shared/group-goal-run";

const DETAIL_LIMIT = 280;

const COPY = {
  working: { label: "Working", tone: "text-accent", border: "border-accent/30" },
  completed: { label: "Completed", tone: "text-success", border: "border-success/30" },
  "needs-input": { label: "Needs your input", tone: "text-warning", border: "border-warning/35" },
  blocked: { label: "Blocked", tone: "text-warning", border: "border-warning/35" },
  "limit-reached": { label: "Turn limit reached", tone: "text-warning", border: "border-warning/35" },
  paused: { label: "Paused", tone: "text-warning", border: "border-warning/35" },
  stopped: { label: "Stopped", tone: "text-ink-secondary", border: "border-hairline/45" },
  failed: { label: "Failed", tone: "text-danger", border: "border-danger/35" },
} satisfies Record<
  GroupGoalRunCardData["status"],
  { label: string; tone: string; border: string }
>;

function compact(value: string | undefined, limit: number): string {
  const clean = value?.replace(/\s+/g, " ").trim() ?? "";
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
}

function StatusIcon({ status }: { status: GroupGoalRunCardData["status"] }) {
  const className = "size-4 shrink-0";
  switch (status) {
    case "working":
      return <Loader2 aria-hidden="true" className={cn(className, "animate-spin text-accent")} />;
    case "completed":
      return <CheckCircle2 aria-hidden="true" className={cn(className, "text-success")} />;
    case "needs-input":
      return <Hand aria-hidden="true" className={cn(className, "text-warning")} />;
    case "blocked":
    case "limit-reached":
    case "paused":
      return <CircleAlert aria-hidden="true" className={cn(className, "text-warning")} />;
    case "stopped":
      return <Square aria-hidden="true" className={cn(className, "text-ink-secondary")} />;
    case "failed":
      return <XCircle aria-hidden="true" className={cn(className, "text-danger")} />;
  }
}

/** `solo` is a one-on-one chat's run, where the bot works alone; `onStop` ends a working run from the card. */
export function GoalRunCard({ message, solo = false, onStop }: { message: Message; solo?: boolean; onStop?: () => void }) {
  const run = message.goalRun;
  if (!run) {
    const fallback = compact(message.text, DETAIL_LIMIT);
    return fallback ? (
      <div className="w-fit max-w-[min(var(--chat-bubble-max),var(--chat-card-pct))] rounded-2xl bg-card px-4 py-2.5 text-[14px] leading-relaxed text-ink">
        {fallback}
      </div>
    ) : null;
  }

  const copy = COPY[run.status];
  const label = t(`goalRun.${run.status}`);
  const goal = compact(roomGoalTitle(run.goal), 180);
  const detail = run.detail;
  const savedAssignments = run.checkpoint?.version === 1 && Array.isArray(run.checkpoint.assignments)
    ? run.checkpoint.assignments.slice(0, 4).filter(item => typeof item?.name === "string" && typeof item.instruction === "string") : [];
  const turns = run.status === "working"
    ? t("goalRun.turnWorking", { turn: Math.min(run.turnCount + 1, run.maxTurns), max: run.maxTurns })
    : t("goalRun.turns", { count: run.turnCount });

  return (
    <section
      aria-label={t("goalRun.aria", { status: label })}
      className={cn("w-full max-w-[680px] rounded-2xl border bg-card px-3.5 py-3 shadow-sm", copy.border)}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-inset">
          <StatusIcon status={run.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="truncate text-[14px] font-medium text-ink">{goal || t("goalRun.title")}</h3>
            <span aria-live="polite" className={cn("text-[12px] font-medium", copy.tone)}>
              {label}
            </span>
          </div>
          {detail?.trim() && <ExecutionDetail text={detail} system={run.status === "stopped"} className="mt-1 text-[13px] leading-relaxed text-ink-secondary" />}
          <p className="mt-1 text-[12px] text-ink-tertiary">
            {solo ? run.coordinatorName : t("goalRun.coordinating", { name: run.coordinatorName })} · {turns}
          </p>
        </div>
        {onStop && run.status === "working" && (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-lg border border-hairline/50 px-2.5 py-1 text-[12px] font-medium text-ink-secondary hover:bg-raised hover:text-ink"
          >
            {t("chat.stop")}
          </button>
        )}
      </div>
      {!solo && run.status !== "working" && run.checkpoint?.phase !== "settled" && savedAssignments.length > 0 && (
        <details className="mt-3 border-t border-hairline/50 pt-2 text-[12px] text-ink-secondary">
          <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-accent">{t("goalRun.savedDecision")}</summary>
          <p className="mt-2">{t("goalRun.savedDecisionReview")}</p>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {savedAssignments.map((item, index) => <li key={`${item.botId}-${index}`} className="rounded-lg bg-inset/60 p-2">
              <p className="text-ink">{item.name.slice(0, 100)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{item.instruction.slice(0, 2_000)}</p>
            </li>)}
          </ul>
        </details>
      )}
      {!solo && Boolean(run.followups?.length) && (
        <div className="mt-3 border-t border-hairline/50 pt-2.5">
          <p className="text-[11px] font-medium text-ink-secondary">{t("goalRun.followups")}</p>
          <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto" aria-label={t("goalRun.followups")}>
            {run.followups?.map(followup => (
              <li key={followup.messageId} className="flex items-start justify-between gap-3 rounded-lg bg-inset/60 px-2.5 py-1.5 text-[12px]">
                <span className="min-w-0 whitespace-pre-wrap break-words text-ink">{followup.text}</span>
                <span className="shrink-0 text-ink-secondary">
                  {followup.state === "waiting" && followup.replyMessageId
                    ? t("goalRun.followup.repliedWaiting")
                    : t(`goalRun.followup.${followup.state}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function GoalRunRow({ botId, threadId, message }: { botId: string; threadId?: string; message: Message }) {
  const { dispatch } = useStore();
  return (
    <div className="flex justify-start">
      <GoalRunCard message={message} solo onStop={() => dispatch({ type: "interrupt", botId, threadId })} />
    </div>
  );
}
