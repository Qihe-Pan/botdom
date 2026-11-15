import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, Eye, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { fetchRoomMessages } from "@/state/bot-rooms";
import { useStore, type Bot, type Group } from "@/state/store";
import { isGoalControlOnly, stripLeakedSystemHarnessMessages } from "../../shared/system-message-guard";
import type { WireMessage } from "../../shared/wire";
import { BotAvatar } from "./Avatar";
import { ChatMarkdown } from "./ChatMarkdown";
import { animateConversationContents } from "@/hooks/use-interface-motion";

export function relevantRoomMessages(messages: readonly WireMessage[], bot: Pick<Bot, "id" | "name">): WireMessage[] {
  return messages.filter((message) => {
    if (message.kind !== "text" || !message.text?.trim() || isGoalControlOnly(message.text)) return false;
    if (!stripLeakedSystemHarnessMessages(message.text).trim()) return false;
    if (message.from?.botId === bot.id || message.roomAssignment?.recipient.botId === bot.id
      || message.replyRecipient?.botId === bot.id || message.legacyHistory?.recipient?.botId === bot.id) return true;
    const mention = `@${bot.name}`;
    let at = message.text.indexOf(mention);
    while (at !== -1) {
      const after = message.text[at + mention.length];
      if (!after || !/[\p{L}\p{N}_-]/u.test(after)) return true;
      at = message.text.indexOf(mention, at + mention.length);
    }
    return false;
  });
}

export function BotRoomLog({ bot, group, threadId = group.threadId, conversationTitle, onClose }: {
  bot: Bot; group: Group; threadId?: string; conversationTitle?: string; onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [page, setPage] = useState<{ messages: WireMessage[]; hasMore: boolean } | null>(null);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const loadingPage = useRef(false);
  const view = useRef<HTMLElement>(null);

  useLayoutEffect(() => { setHost(document.querySelector<HTMLElement>("main")); }, []);

  useLayoutEffect(() => {
    if (!host) return;
    const previousFocus = document.activeElement;
    const hidden = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
    const hidePrivateChat = () => {
      for (const child of host.children) {
        if (!(child instanceof HTMLElement) || child.hasAttribute("data-bot-room-log") || hidden.has(child)) continue;
        hidden.set(child, { inert: child.inert, ariaHidden: child.getAttribute("aria-hidden") });
        child.inert = true;
        child.setAttribute("aria-hidden", "true");
      }
    };
    host.setAttribute("data-bot-room-host", "");
    hidePrivateChat();
    const observer = new MutationObserver(hidePrivateChat);
    observer.observe(host, { childList: true });
    view.current?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      host.removeAttribute("data-bot-room-host");
      for (const [child, previous] of hidden) {
        child.inert = previous.inert;
        if (previous.ariaHidden === null) child.removeAttribute("aria-hidden");
        else child.setAttribute("aria-hidden", previous.ariaHidden);
      }
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      requestAnimationFrame(() => { if (host.isConnected) animateConversationContents(host); });
    };
  }, [host]);

  useEffect(() => {
    const current = ++generation.current;
    setPage(null); setError(""); setLoadingOlder(false); loadingPage.current = false;
    fetchRoomMessages(threadId, { limit: 300 })
      .then((answer) => {
        if (generation.current === current) setPage({ messages: answer.messages, hasMore: Boolean(answer.hasMore && answer.messages.length) });
      })
      .catch((cause) => { if (generation.current === current) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { generation.current++; };
  }, [threadId, revision]);

  const loadOlder = async () => {
    const before = page?.messages[0]?.id;
    if (!before || loadingPage.current) return;
    const current = generation.current;
    loadingPage.current = true; setLoadingOlder(true); setError("");
    try {
      const answer = await fetchRoomMessages(threadId, { limit: 300, before });
      if (generation.current !== current) return;
      setPage((previous) => {
        if (!previous) return previous;
        const known = new Set(previous.messages.map((message) => message.id));
        const older = answer.messages.filter((message) => !known.has(message.id));
        return { messages: [...older, ...previous.messages], hasMore: Boolean(answer.hasMore && older.length) };
      });
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) { loadingPage.current = false; setLoadingOlder(false); }
    }
  };
  const messages = page ? relevantRoomMessages(page.messages, bot) : null;
  const nameOf = (message: WireMessage) => message.role === "user" ? t("chat.you") : message.from?.botId === group.supervisorId ? t("botdom.members.lead") : message.from?.name ?? "";
  const botOf = (message: WireMessage) => state.bots.find((candidate) => candidate.id === message.from?.botId);

  if (!host) return null;
  return createPortal(<section ref={view} tabIndex={-1} data-bot-room-log="" role="region"
    aria-label={t("botRoomLog.title", { bot: bot.name, group: group.name })}
    className="bot-room-log flex h-full min-h-0 min-w-0 flex-col bg-app text-ink outline-none"
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <header className="flex flex-wrap items-center gap-3 border-b border-hairline/40 px-5 py-4">
      <BotAvatar bot={bot} size={30} animated={false} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-normal">{t("botRoomLog.title", { bot: bot.name, group: group.name })}</h1>
        {conversationTitle && <p className="truncate text-[12px] text-ink-secondary">{conversationTitle}</p>}
      </div>
      <nav className="flex flex-wrap items-center gap-2" aria-label={t("botRoomLog.navigation")}>
        <button type="button" onClick={onClose} className="bot-room-log-action"><ArrowLeft size={14} />{t("botRoomLog.backToPrivate")}</button>
        <button type="button" onClick={() => {
          // Leave the read-only view, show the room itself, then its conversation: switching the thread alone left
          // the private chat on screen.
          onClose();
          dispatch({ type: "select", id: group.id });
          if (threadId !== group.threadId) dispatch({ type: "switchGroupTask", groupId: group.id, threadId });
        }}
          className="bot-room-log-action">{t("botRoomLog.openGroup")}<ArrowUpRight size={14} /></button>
      </nav>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/40 px-5 py-2.5 text-[12px] text-ink-secondary">
      <p className="flex items-center gap-1.5"><Eye size={13} aria-hidden="true" />{t("botRoomLog.readOnly")}</p>
      <button type="button" onClick={() => setRevision((value) => value + 1)} className="bot-room-log-action" disabled={!page && !error}>
        <RefreshCw size={13} />{t("botRoomLog.refresh")}
      </button>
    </div>
    <div data-conversation-content="" className="min-h-0 flex-1 overflow-y-auto px-5 py-5" aria-busy={!page && !error || loadingOlder}>
      {error && <div role="alert" className="mb-4 text-[13px] text-danger">{error}
        <button type="button" className="bot-room-log-action ml-2" onClick={() => page ? void loadOlder() : setRevision((value) => value + 1)}>{t("botRoomLog.retry")}</button>
      </div>}
      {!error && !page && <p role="status" className="py-10 text-center text-[13px] text-ink-secondary">{t("botRoomLog.loading")}</p>}
      {page?.hasMore && <button type="button" disabled={loadingOlder} onClick={() => { void loadOlder(); }} className="bot-room-log-action mx-auto mb-5 flex">{t(loadingOlder ? "botdom.document.loading" : "botRoomLog.loadOlder")}</button>}
      {messages && !messages.length && <p className="py-10 text-center text-[13px] text-ink-secondary">{t(page?.hasMore ? "botRoomLog.emptyPage" : "botRoomLog.empty")}</p>}
      <ol className="mx-auto flex w-full max-w-[860px] flex-col gap-5" aria-label={t("botRoomLog.messages")}>
        {messages?.map((message, index) => {
          const own = message.from?.botId === bot.id;
          const speaker = botOf(message);
          return <li key={message.id} style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }} className={cn("flex gap-2.5", own ? "flex-row" : "flex-row-reverse")}>
            <span className="mt-5 shrink-0">{speaker ? <BotAvatar bot={speaker} size={24} animated={false} /> : <span className="block size-6 rounded-full bg-raised" />}</span>
            <div className={cn("min-w-0 max-w-[82%]", !own && "text-right")}>
              <p className="mb-1 px-1 text-[11.5px] text-ink-tertiary">
                <span data-bot-color={speaker?.color} className={cn(speaker && "bot-identity")}>{nameOf(message)}</span>
                <time dateTime={new Date(message.at).toISOString()} className="ml-1.5 tabular-nums">{new Date(message.at).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
              </p>
              <div dir="auto" data-bot-color={own ? bot.color : undefined}
                className={cn("break-words [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2 text-start text-[13.5px] font-normal leading-6 text-ink", own ? "bot-bubble-tint bg-raised/60" : "bg-raised/40")}>
                <ChatMarkdown text={stripLeakedSystemHarnessMessages(message.text)} />
              </div>
            </div>
          </li>;
        })}
      </ol>
    </div>
  </section>, host);
}
