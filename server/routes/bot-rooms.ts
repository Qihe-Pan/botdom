import type { BotRoom } from "../../shared/bot-rooms.ts";
import type { VisibleSet } from "../bot-visibility.ts";
import type { RequestAuth } from "../request-auth.ts";
import type { Store } from "../store.ts";
import { PASS, type RouteHandler } from "./table.ts";

export function createBotRoomsRoutes(deps: {
  store: Pick<Store, "bot" | "groups" | "messagesTail">;
  visibleFor(auth: RequestAuth): VisibleSet;
  cloudThreadRefusal(auth: RequestAuth, threadId: string): string | null;
}): RouteHandler {
  return async ({ path, method, auth, res, json }) => {
    const match = path.match(/^\/api\/bots\/([\w-]+)\/rooms$/);
    if (!match || method !== "GET") return PASS;
    const id = match[1]!;
    const visible = deps.visibleFor(auth);
    if (!deps.store.bot(id) || !visible.bot(id)) return json(res, 404, { error: "no such bot" });
    const rooms: BotRoom[] = [];
    for (const group of deps.store.groups) {
      if (group.dm || !group.memberIds.includes(id) || !visible.group(group.id)) continue;
      const tasks = group.tasks?.length ? group.tasks : [{ threadId: group.threadId, title: group.name, createdAt: group.createdAt, updatedAt: group.createdAt }];
      const conversations = tasks.filter(task => visible.thread(task.threadId) && !deps.cloudThreadRefusal(auth, task.threadId)).map(task => ({
        threadId: task.threadId, title: task.title,
        lastActivityAt: deps.store.messagesTail(task.threadId, 1).messages.at(-1)?.at ?? task.updatedAt ?? task.createdAt,
      })).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
      if (conversations.length) rooms.push({ groupId: group.id, name: group.name, conversations, lastActivityAt: conversations[0]!.lastActivityAt });
    }
    rooms.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return json(res, 200, { rooms });
  };
}
