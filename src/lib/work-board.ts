import type { Bot, Group, GroupTask } from "@/state/store";
import { ROOM_TODO_PRIORITIES, orderedRoomTodos, type RoomTodo } from "../../shared/room-todo";
import { roomTodoExecution } from "./room-threads";

export interface WorkBoardItem {
  key: string;
  group: Group;
  conversation: GroupTask;
  todo: RoomTodo;
}

export function workBoardItems(groups: readonly Group[]): WorkBoardItem[] {
  return groups.filter(group => !group.dm).flatMap(group => (group.tasks ?? [])
    .filter(task => !task.archivedAt).flatMap(conversation => {
      const scoped = group.threadId === conversation.threadId ? group : { ...group, threadId: conversation.threadId, messages: [], hasMore: false };
      return orderedRoomTodos(conversation.todos ?? []).filter(todo => todo.status !== "cancelled").map(todo => ({
        key: JSON.stringify([group.id, conversation.threadId, todo.id]), group: scoped, conversation, todo,
      }));
    })).sort((a, b) => ROOM_TODO_PRIORITIES.indexOf(a.todo.priority ?? "normal") - ROOM_TODO_PRIORITIES.indexOf(b.todo.priority ?? "normal"));
}

export interface WorkBoardFilter { groupId: string; botId: string; priority: string; query: string }

export const WORK_BOARD_VIEWS = ["all", "accept", "review", "blocked"] as const;
export type WorkBoardView = typeof WORK_BOARD_VIEWS[number];

export function workBoardMatchesView(item: WorkBoardItem, view: WorkBoardView): boolean {
  if (view === "all") return true;
  if (item.todo.activeAssignment || roomTodoExecution(item.group, item.todo)) return false;
  return item.todo.status === ({ accept: "review_ok", review: "reported", blocked: "blocked" } as const)[view];
}

export function filterWorkBoard(items: readonly WorkBoardItem[], filter: WorkBoardFilter, bots: readonly Bot[]): WorkBoardItem[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const names = new Map(bots.map(bot => [bot.id, bot.name]));
  return items.filter(({ group, conversation, todo }) =>
    (!filter.groupId || group.id === filter.groupId) &&
    (!filter.botId || (filter.botId === "unassigned" ? !todo.assigneeId : todo.assigneeId === filter.botId)) &&
    (!filter.priority || (todo.priority ?? "normal") === filter.priority) &&
    (!query || [todo.title, todo.description, todo.acceptanceCriteria, todo.id, group.name, conversation.title, names.get(todo.assigneeId ?? "")].some(value => value?.toLocaleLowerCase().includes(query))));
}
