import { CircleHelp, Clock3, LoaderCircle, ChevronDown } from "lucide-react";
import { t } from "@/lib/i18n";
import type { RoomInterjectionReceipt } from "@/state/room-interjection";

export function RoomMessageDelivery({ receipt }: { receipt?: RoomInterjectionReceipt }) {
  if (!receipt || receipt.status === "delivered") return null;
  const checking = receipt.status === "uncertain" || receipt.status === "unavailable";
  const sending = receipt.status === "sending" || receipt.status === "dispatching";
  const label = checking ? "room.delivery.check"
    : sending ? "room.delivery.sending"
    : receipt.status === "cancelled" ? "room.delivery.cancelled"
    : receipt.status === "interrupted" ? "room.delivery.interrupted"
    : receipt.blockedBy === "recipient" ? "room.delivery.paused"
    : receipt.blockedBy === "images" ? "room.delivery.images"
    : "room.delivery.waiting";
  return <div data-room-delivery={receipt.status} data-queue-id={receipt.queueId} className="min-w-0 text-[11px] leading-5 text-ink-secondary">
    {checking ? <details className="group/delivery max-w-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-0.5 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <CircleHelp size={12} aria-hidden="true" />
        <span>{t(label)}</span>
        <ChevronDown size={11} aria-hidden="true" className="transition-transform group-open/delivery:rotate-180 motion-reduce:transition-none" />
      </summary>
      <p className="mt-1 px-0.5 text-left leading-5">{t("room.delivery.checkHelp")}</p>
    </details> : <span className="inline-flex items-center gap-1" role={sending ? "status" : undefined}>
      {sending ? <LoaderCircle size={12} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Clock3 size={12} aria-hidden="true" />}
      {t(label)}
    </span>}
  </div>;
}
