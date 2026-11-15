import { activeLocale } from "@/lib/i18n";
import { dayLabel, localDay } from "@/lib/transcript-derivations";
import { cn } from "@/lib/cn";
import { createContext, useContext } from "react";

export const MessageDayContext = createContext<number | null>(null);

export function messageTimestamp(at: number, now = Date.now()): string {
  const locale = activeLocale();
  const date = new Date(at);
  const day = date.getFullYear() !== new Date(now).getFullYear()
    ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", weekday: "short" }).format(date)
    : dayLabel(at, localDay(now));
  return `${day} ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date)}`;
}

export function MessageTimestamp({ at, className }: { at: number; className?: string }) {
  const today = useContext(MessageDayContext);
  const now = today ?? Date.now();
  return <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()} data-message-time
    className={cn("mt-1 px-1 text-[10px] leading-4 font-normal tabular-nums text-ink-tertiary", className)}>{messageTimestamp(at, now)}</time>;
}
