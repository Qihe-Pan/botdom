import { randomUUID } from "node:crypto";
import { isRoomSupervisor } from "../shared/room-supervisor.ts";
import type { BotRecord, Store } from "./store.ts";

export function roomReplyMayDispatchMentions(supervisorId: string | undefined, senderId: string): boolean {
  return !supervisorId || senderId === supervisorId;
}

export function createSupervisedRoom(store: Pick<Store, "bot" | "groups" | "createBot" | "createGroup" | "deleteBot">, name: string, memberIds: string[], bulletin = "", supervisorModel?: BotRecord["modelSelection"], approvalMode: BotRecord["approvalMode"] = "ask", cwd?: string) {
  const employees = memberIds.map((id) => store.bot(id));
  if (!employees.length || employees.some((bot) => !bot || isRoomSupervisor(bot, store.groups))) throw Object.assign(new Error("choose employee bots, not another room's supervisor"), { status: 400 });
  const first = employees[0]!;
  const id = randomUUID();
  const supervisor = store.createBot({
    name: `主管 · ${name}`,
    approvalMode,
    title: "群主管",
    description: "仅在所属群内负责协调员工与推进任务。",
    soul: "你是这个群的专属主管。普通群消息交给你处理。根据群内实际成员协调任务、核对结果，并向用户清楚汇报。仅协调所属群的成员，不担任全局管理者。",
    color: "purple",
    modelSelection: { ...(supervisorModel ?? first.modelSelection) },
    visibility: first.visibility,
    createdBy: first.createdBy,
    reportsTo: first.reportsTo,
    supervisorGroupId: id,
    peers: memberIds,
  }, { seedMessages: false });
  try {
    return store.createGroup(name, [supervisor.id, ...memberIds], false, undefined, {
      id, cwd, supervisorId: supervisor.id, defaultResponder: { kind: "member", botId: supervisor.id }, bulletin, completed: true,
    });
  } catch (error) {
    store.deleteBot(supervisor.id);
    throw error;
  }
}
