/** Durable facts for one person's queued room sends. A transcript row is not a delivery acknowledgement.
 * `dispatching` and `uncertain` must never be replayed. Only `pending` is eligible for delivery.
 * `botId` and `executionId` identify the selected execution in the public room conversation. */
export interface RoomQueuedMessage {
  queueId: string;
  sendId?: string;
  groupId: string;
  threadId: string;
  text: string;
  replyToId?: string;
  mode: "chat" | "goal";
  state: "pending" | "dispatching" | "delivered" | "uncertain" | "cancelled" | "interrupted";
  botId?: string;
  executionId?: string;
  messageId?: string;
  queuedAt: number;
  updatedAt: number;
}

/** Read-only, author-filtered snapshot; query by queueId or sendId to recover a lost response. */
export interface RoomMessageQueueSnapshot {
  groupId: string;
  threadId: string;
  items: RoomQueuedMessage[];
}
