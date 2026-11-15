import type { Message } from "@/state/store";
import { RoomMessageDelivery } from "./RoomMessageDelivery";
import { useRoomMessageReceipts, type SavedReceipt } from "./use-room-interjection";

export function receiptForMessage(receipts: readonly SavedReceipt[], message: Pick<Message, "role" | "queueId" | "sendId">) {
  if (message.role !== "user") return undefined;
  return receipts.findLast(receipt => {
    if (message.sendId && receipt.sendId) return message.sendId === receipt.sendId;
    return Boolean((message.queueId && message.queueId === receipt.queueId) ||
      (message.sendId && receipt.queueId === `send:${message.sendId}`));
  });
}

export function RoomMessageReceipt({ groupId, threadId, message }: { groupId: string; threadId: string; message: Message }) {
  const receipts = useRoomMessageReceipts(groupId, threadId);
  return <div className="mr-[34px] max-w-full text-right">
    <RoomMessageDelivery receipt={receiptForMessage(receipts, message)} />
  </div>;
}
