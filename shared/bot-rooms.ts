export interface BotRoomConversation {
  threadId: string;
  title: string;
  lastActivityAt: number;
}

export interface BotRoom {
  groupId: string;
  name: string;
  conversations: BotRoomConversation[];
  lastActivityAt: number;
}

export interface BotRoomsResponse { rooms: BotRoom[] }
