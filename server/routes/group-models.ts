import type { ModelSelection } from "../../shared/wire.ts";
import { roomMemberModel } from "../../shared/group-models.ts";
import type { Store } from "../store.ts";
import type { RequestAuth } from "../request-auth.ts";
import { PASS, type RouteHandler } from "./table.ts";

export function createGroupModelRoutes(deps: {
  store: Pick<Store, "group" | "bot" | "patchGroup">;
  canManage(auth: RequestAuth, groupId: string): boolean;
  busy(botId: string): boolean;
  check(raw: unknown, current: { selection: ModelSelection; busy: boolean }, requireAvailable: boolean):
    { ok: true; selection: ModelSelection } | { ok: false; status: number; error: string };
}): RouteHandler {
  return async ({ req, res, path, method, auth, json, readBody }) => {
    const match = path.match(/^\/api\/groups\/([\w-]+)\/(?:models|member-models)$/);
    if (!match || method !== "PATCH") return PASS;
    const group = deps.store.group(match[1]!);
    if (!group || group.dm || !deps.canManage(auth, group.id)) return json(res, 404, { error: "no such room" });
    const body = await readBody(req);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "changes") ||
        !Array.isArray(body.changes) || !body.changes.length || body.changes.length > 100) return json(res, 400, { error: "changes must be a nonempty array of at most 100 bots" });
    const selections = new Map<string, ModelSelection>();
    for (const change of body.changes) {
      if (!change || typeof change !== "object" || Array.isArray(change) || Object.keys(change).some(key => !["botId", "model", "effort", "variant"].includes(key)) ||
          typeof change.botId !== "string" || typeof change.model !== "string" || selections.has(change.botId)) return json(res, 400, { error: "invalid or duplicate model change" });
      const bot = deps.store.bot(change.botId);
      if (!bot || !group.memberIds.includes(bot.id)) return json(res, 400, { error: "bot is not a room member" });
      const current = roomMemberModel(group, bot);
      const checked = deps.check({ instanceId: bot.modelSelection.instanceId, model: change.model, ...(change.effort !== undefined ? { effort: change.effort } : {}), ...(change.variant !== undefined ? { variant: change.variant } : {}) },
        { selection: current, busy: deps.busy(bot.id) }, true);
      if (!checked.ok) return json(res, checked.status, { error: checked.error });
      selections.set(bot.id, checked.selection);
    }
    const memberModels = { ...group.memberModels, ...Object.fromEntries(selections) };
    deps.store.patchGroup(group.id, { memberModels });
    const bots = [...selections].map(([botId, modelSelection]) => ({ botId, modelSelection }));
    return json(res, 200, { bots, memberModels });
  };
}
