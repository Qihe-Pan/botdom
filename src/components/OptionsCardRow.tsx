import type { ReactNode } from "react";
import type { Bot, Message } from "@/state/store";
import { ApprovalCard } from "./ApprovalCard";
import { t } from "@/lib/i18n";
import { MessageBoundary } from "./MessageBoundary";
import { OptionCard, shouldHideOnboardingCard } from "./OptionCard";
import { QuestionCard } from "./QuestionCard";
import { isQuestionCard } from "@/lib/question-card";
import type { Asker } from "./AskCard";
import { AskingLine } from "./TeamOwner";

/**
 * Called, not mounted: a quiz that dropped out must come back as null so the transcript draws no row and no day
 * separator.
 */
function typedPast(card: Message, transcript: Message[]): boolean {
  const index = transcript.findIndex((entry) => entry.id === card.id);
  return index >= 0 && transcript.slice(index + 1).some((later) => later.role === "user" && later.kind === "text");
}

export function optionsCardRow({ message: m, transcript, botId, botName, botColor, threadId, asker }: {
  message: Message;
  transcript: Message[];
  botId: string;
  botName: string;
  botColor?: Bot["color"];
  threadId: string;
  /** The bot that asks: this conversation's, or for an inbox's copy the one that asked where it came from. */
  asker?: Asker;
}): ReactNode {
  // MausBot's follow-up is drawn under its intro (HelperIntro), never as a row of its own.
  if (m.helperFollowup) return null;
  const card = m.helperIntro ? (
    <div data-chat-bubble="greeting" className="w-fit max-w-[min(480px,100%)] rounded-2xl bg-card px-4 py-2.5 text-[14px] leading-relaxed text-ink">{t("chat.botdomGreeting", { name: botName })}</div>
  ) : isQuestionCard(m.card) ? (
    <QuestionCard threadId={threadId} asker={asker ?? (botColor ? { name: botName, color: botColor } : undefined)} message={m} typedPast={typedPast(m, transcript)} />
  ) : m.card?.requestId && m.card.tool ? (
    <ApprovalCard bot={{ name: botName }} message={m} threadId={threadId} />
  ) : shouldHideOnboardingCard(m, transcript) ? null : (
    <OptionCard botId={botId} threadId={threadId} message={m} />
  );
  if (!card) return null;
  const waiting = Boolean(m.card?.requestId && (isQuestionCard(m.card) || m.card.tool) && !m.card.answered && !m.card.dismissed && !m.inbox);
  return (
    <MessageBoundary fallbackText={m.card?.subtitle || m.card?.title || ""}>
      {waiting && <AskingLine botId={botId} threadId={threadId} />}
      {card}
    </MessageBoundary>
  );
}
