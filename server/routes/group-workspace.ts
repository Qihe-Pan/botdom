import { GroupDocs } from "../group-docs.ts";
import { GroupFileChanged, GroupFiles, groupFileContentType } from "../group-files.ts";
import { ensureGroupWorkspace } from "../group-workspace.ts";
import { messageFileDisposition } from "../message-file.ts";
import type { RequestAuth } from "../request-auth.ts";
import type { Store } from "../store.ts";
import { PASS, type RouteHandler } from "./table.ts";

export function createGroupWorkspaceRoutes(deps: {
  store: Pick<Store, "group" | "patchGroup">;
  visibleGroup(auth: RequestAuth, id: string): boolean;
  cloudThreadRefusal(auth: RequestAuth, threadId: string): string | null;
  changed(groupId: string): void;
}): RouteHandler {
  return async ({ req, res, path, method, url, auth, json, readBody }) => {
    const match = path.match(/^\/api\/groups\/([\w-]+)\/(files|docs)(?:\/([^/]+)(?:\/(content))?)?$/);
    if (!match) return PASS;
    const [, id, resource, target, content] = match;
    const group = deps.store.group(id!);
    if (!group || group.dm || !deps.visibleGroup(auth, group.id)) return json(res, 404, { error: "no such room" });
    const refusal = deps.cloudThreadRefusal(auth, group.threadId);
    if (refusal) return json(res, 403, { error: refusal });
    const folder = ensureGroupWorkspace(deps.store, group);
    const changed = () => deps.changed(group.id);
    if (resource === "files" && method === "GET") {
      const files = new GroupFiles(group.id, folder, changed);
      if (!target) return json(res, 200, files.list(Object.fromEntries(url.searchParams)));
      if (!content) return PASS;
      let file: ReturnType<GroupFiles["content"]>;
      try { file = files.content(target); }
      catch (error) { if (error instanceof GroupFileChanged) return json(res, 409, { error: "file changed; reopen to view the current revision" }); throw error; }
      if (!file) return json(res, 404, { error: "file unavailable" });
      res.writeHead(200, { "Content-Type": groupFileContentType(file.file), "Content-Length": file.bytes.length, "Content-Disposition": messageFileDisposition(file.file.name), "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" });
      res.end(file.bytes);
      return;
    }
    if (resource !== "docs" || content) return PASS;
    const docs = new GroupDocs(group.id, changed);
    if (!target && method === "GET") return json(res, 200, docs.list());
    if (!target) return PASS;
    let name: string;
    try { name = decodeURIComponent(target); } catch { return json(res, 400, { error: "invalid note name" }); }
    if (method === "GET") return json(res, 200, docs.read(name));
    if (method === "PUT") {
      const body = await readBody(req);
      return json(res, 200, docs.write(name, body.text, body.baseUpdatedAt));
    }
    if (method === "DELETE") { docs.delete(name); res.writeHead(204); res.end(); return; }
    return PASS;
  };
}
