import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Bot, Message } from "@/state/store";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";
import { ChatMarkdown } from "./ChatMarkdown";
import { MessageAttachmentGallery } from "./AttachmentGallery";
import { SidebarFold } from "./SidebarFold";
import { MAUS_COLOR_NAMES, type MausColor } from "@/lib/mascot";
import { documentDisplayText } from "@/lib/document-preview";

const avatarColor = (color: string): MausColor => (MAUS_COLOR_NAMES as readonly string[]).includes(color) ? color as MausColor : "purple";

export function isRoomCoordinationEvent(message: Message): boolean {
  return ["member_join", "member_leave", "member_report", "delegation"].includes(message.legacyHistory?.kind ?? "")
    || Boolean(message.roomAssignment)
    || Boolean(message.replyRecipient && (message.kind === "text" || message.roomRequest?.phase === "result"));
}

export function RoomCoordinationEvent({ message, threadId, bots }: { message: Message; threadId: string; bots: readonly Bot[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const kind = message.legacyHistory?.kind;
  if (kind === "member_join" || kind === "member_leave") {
    return <div data-room-system-event={kind} className="py-1 text-center text-[12px] leading-5 text-ink-secondary">{message.text}</div>;
  }
  const from = message.from;
  const recipient = message.roomAssignment?.recipient ?? message.replyRecipient ?? message.legacyHistory?.recipient;
  const source = bots.find(bot => bot.id === from?.botId);
  const target = bots.find(bot => bot.id === recipient?.botId);
  const verb = message.tool?.ok === false ? t("botdom.coordination.failed") : kind === "delegation" || message.roomAssignment ? t("botdom.coordination.assigned") : recipient ? t("botdom.coordination.replied") : t("botdom.coordination.reported");
  const body = message.text !== undefined ? documentDisplayText(message) : message.tool?.output ?? message.tool?.name ?? "";
  return <div data-room-coordination-event={kind ?? "result"} className="mx-auto w-full max-w-[min(42rem,100%)]">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className="botdom-interactive mx-auto flex min-h-8 max-w-full items-center gap-2 rounded-full border border-hairline/60 bg-panel px-3 py-1.5 text-[12px] font-normal text-ink-secondary hover:border-accent/30 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      {from && <BotAvatar bot={source ?? { name: from.name, color: from.color }} size={18} state="happy" animated={false} />}
      <span className="max-w-48 truncate">{from?.name ?? t("botdom.coordination.employee")}</span>
      <span className="shrink-0">{verb}</span>
      {recipient && <><BotAvatar bot={target ?? { name: recipient.name, color: avatarColor(recipient.color) }} size={18} state="happy" animated={false} /><span className="max-w-48 truncate">{recipient.name}</span></>}
      {message.roomAssignment && <span className="max-w-56 truncate text-ink">· {message.roomAssignment.title}</span>}
      <ChevronDown size={14} className={open ? "shrink-0 rotate-180 transition-transform motion-reduce:transition-none" : "shrink-0 transition-transform motion-reduce:transition-none"} aria-hidden="true" />
    </button>
    <SidebarFold open={open}><div id={id} className="mt-2 w-full rounded-2xl border border-hairline/50 bg-panel px-3 py-2 text-[13px] text-ink">
      <ChatMarkdown text={body} message={{ threadId, messageId: message.id }} />
      <MessageAttachmentGallery text={body} attachments={message.attachments} message={{ threadId, messageId: message.id }} className="w-full [&>div]:w-full [&>div]:items-center" />
    </div></SidebarFold>
  </div>;
}
