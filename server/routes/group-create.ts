import type { ModelSelection, WireBot, WireGroup } from "../../shared/wire.ts";
import { fitsOnOneLine } from "../bot-profile.ts";
import type { RequestAuth } from "../request-auth.ts";
import type { BotRecord, GroupRecord, Store } from "../store.ts";
import { createSupervisedRoom } from "../room-supervisor.ts";
import { PASS, type RouteHandler } from "./table.ts";

export function createGroupWithEmployeesRoutes(deps: {
  store: Pick<Store, "bots" | "groups" | "bot" | "createBot" | "deleteBot" | "createGroup">;
  allowed(auth: RequestAuth): boolean;
  maxBots: number;
  check(raw: unknown): { ok: true; selection: ModelSelection } | { ok: false; status: number; error: string };
  engineName(id: string): string;
  wireBot(bot: BotRecord): WireBot;
  wireGroup(group: GroupRecord): WireGroup;
}): RouteHandler {
  return async ({ req, res, path, method, auth, json, readBody }) => {
    if (path !== "/api/groups/with-employees" || method !== "POST") return PASS;
    if (!deps.allowed(auth)) return json(res, 403, { error: "creating Full Access rooms is unavailable" });
    const body = await readBody(req);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["name", "supervisor", "employees"].includes(key)) ||
        typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100 || !fitsOnOneLine(body.name.trim()) ||
        !Array.isArray(body.employees) || !body.employees.length || body.employees.length > 20) return json(res, 400, { error: "invalid room configuration" });
    const supervisor = deps.check(body.supervisor);
    if (!supervisor.ok) return json(res, supervisor.status, { error: supervisor.error });
    const employees: Array<{ selection: ModelSelection; count: number }> = [];
    for (const entry of body.employees) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).some(key => !["instanceId", "model", "effort", "count"].includes(key)) ||
          !Number.isInteger(entry.count) || entry.count < 1 || entry.count > 20) return json(res, 400, { error: "invalid employee batch" });
      const checked = deps.check({ instanceId: entry.instanceId, model: entry.model, ...(entry.effort !== undefined ? { effort: entry.effort } : {}) });
      if (!checked.ok) return json(res, checked.status, { error: checked.error });
      employees.push({ selection: checked.selection, count: entry.count });
    }
    const count = employees.reduce((total, item) => total + item.count, 0);
    if (count > 20 || deps.store.bots.length + count + 1 > deps.maxBots) return json(res, 409, { error: "workspace bot limit exceeded" });
    const created: BotRecord[] = [];
    const numbers = new Map<string, number>();
    let group: GroupRecord;
    try {
      for (const batch of employees) for (let index = 0; index < batch.count; index++) {
        const label = deps.engineName(batch.selection.instanceId).trim().slice(0, 60) || batch.selection.instanceId;
        const number = (numbers.get(label) ?? 0) + 1;
        numbers.set(label, number);
        created.push(deps.store.createBot({ name: `${label} ${number}`, modelSelection: batch.selection, approvalMode: "full" }));
      }
      group = createSupervisedRoom(deps.store, body.name.trim(), created.map(bot => bot.id), "", supervisor.selection, "full");
    } catch (error) {
      for (const bot of created.reverse()) deps.store.deleteBot(bot.id);
      throw error;
    }
    return json(res, 201, { group: deps.wireGroup(group), employees: created.map(deps.wireBot) });
  };
}
