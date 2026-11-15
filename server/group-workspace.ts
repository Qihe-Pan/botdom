import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { DATA_DIR } from "./config.ts";
import type { GroupRecord, Store } from "./store.ts";
import { inSecretFolder } from "./secret-folder.ts";

export function insideFolder(root: string, path: string): boolean {
  const part = relative(root, path);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

export function ensureGroupWorkspace(store: Pick<Store, "patchGroup">, group: GroupRecord, dataDir = DATA_DIR): string {
  if (group.dm) throw Object.assign(new Error("direct messages have no group workspace"), { status: 404 });
  if (!group.cwd) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(group.id)) throw new Error("Invalid group workspace owner");
    const parent = join(dataDir, "group-workspaces");
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    if (lstatSync(parent).isSymbolicLink() || !insideFolder(realpathSync(dataDir), realpathSync(parent))) throw new Error("Group workspace escapes data folder");
    const folder = join(parent, group.id);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    if (lstatSync(folder).isSymbolicLink() || !insideFolder(realpathSync(dataDir), realpathSync(folder))) throw new Error("Group workspace escapes data folder");
    mkdirSync(join(folder, "deliverables"), { recursive: true, mode: 0o700 });
    store.patchGroup(group.id, { cwd: folder });
    return folder;
  }
  return group.cwd;
}

export function resolvedGroupFile(folder: string, path: string): string | null {
  try {
    if (inSecretFolder(folder) || inSecretFolder(path)) return null;
    const canonical = realpathSync(resolve(folder, path));
    return !inSecretFolder(canonical) && insideFolder(realpathSync(folder), canonical) && statSync(canonical).isFile() ? canonical : null;
  } catch { return null; }
}

export function readWorkspaceFile(folder: string, path: string, maximum: number, prefix = false): Buffer | null {
  const canonical = resolvedGroupFile(folder, path);
  if (!canonical) return null;
  let fd: number | undefined;
  try {
    fd = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    const after = resolvedGroupFile(folder, path);
    if (!after || after !== canonical) return null;
    const current = statSync(after);
    if (!opened.isFile() || opened.ino !== current.ino || opened.dev !== current.dev || (!prefix && opened.size > maximum)) return null;
    const bytes = Buffer.alloc(prefix ? Math.min(opened.size, maximum) : opened.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = readSync(fd, bytes, count, bytes.length - count, count);
      if (!n) break;
      count += n;
    }
    return count > maximum || count > opened.size ? null : bytes.subarray(0, count);
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}
