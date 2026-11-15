import { useLayoutEffect, type RefObject } from "react";
import type { Bot } from "@/state/store";
import { useStreamReply } from "@/state/stream-reply";
import { BotAvatar } from "./Avatar";
import { ChatMarkdown } from "./ChatMarkdown";
import { MessageTimestamp } from "./MessageTimestamp";
import { SIMPLE_BOT_BUBBLE, SIMPLE_BUBBLE_MAX } from "./chat-bubble";

export function StreamingReply({ threadId, bot, following, scrollRef, memberStream = false }: { memberStream?: boolean; threadId: string; bot: Bot; following: boolean; scrollRef: RefObject<HTMLDivElement | null> }) {
  const reply = useStreamReply(threadId, memberStream ? bot.id : undefined);
  useLayoutEffect(() => {
    if (reply?.text && following && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [reply?.text, following, scrollRef]);
  if (!reply?.text) return null;
  return <div data-streaming-reply className="flex w-full flex-col items-start" aria-live="off">
    <div className="mb-1 ml-[36px] text-[12px] text-ink-secondary">{bot.name}</div>
    <div className="flex w-full items-start gap-2"><span className="shrink-0"><BotAvatar bot={bot} size={28} state="happy" animated={false} /></span>
      <div data-chat-bubble className={`w-fit ${SIMPLE_BUBBLE_MAX} ${SIMPLE_BOT_BUBBLE}`}><ChatMarkdown text={reply.text} /></div>
    </div><MessageTimestamp at={Number.isFinite(reply.at) ? reply.at : Date.now()} className="ml-[36px]" />
  </div>;
}
