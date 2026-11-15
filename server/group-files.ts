import { createHash, randomUUID } from "node:crypto";
import { lstatSync, opendirSync, realpathSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { GroupFile, GroupFileKind, GroupFilesPage } from "../shared/group-workspace.ts";
import type { WireMessage } from "../shared/wire.ts";
import { writeFileAtomic } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";
import { contextDirectory, ensureContextDocument } from "./context-documents.ts";
import { decodeAttachmentAttribute, messageAttachmentName, messageFileTargets, mimeFor } from "./message-file.ts";
import { insideFolder, readWorkspaceFile, resolvedGroupFile } from "./group-workspace.ts";
import { inSecretFolder } from "./secret-folder.ts";

export function groupFileKind(path: string): GroupFileKind {
  const ext = extname(path).slice(1).toLowerCase();
  if (["doc", "docx", "odt"].includes(ext)) return "doc";
  if (["xlsx", "xls", "csv", "tsv", "ods"].includes(ext)) return "sheet";
  if (["pptx", "ppt", "odp"].includes(ext)) return "slides";
  if (ext === "pdf") return "pdf";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["js", "jsx", "ts", "tsx", "py", "go", "rs", "java", "c", "h", "cpp", "hpp", "cs", "rb", "php", "sh", "bash", "zsh", "swift", "kt", "sql", "html", "css", "scss", "json", "yaml", "yml", "vue", "svelte", "r", "m", "mm"].includes(ext)) return "code";
  return "other";
}

export function groupFileContentType(file: GroupFile): string {
  const mime = mimeFor(file.path);
  if (mime !== "application/octet-stream") return mime;
  if (/\.svg$/i.test(file.path)) return "image/svg+xml";
  if (file.kind === "markdown") return "text/markdown; charset=utf-8";
  if (file.kind === "code") {
    if (/\.[cm]?jsx?$/i.test(file.path)) return "text/javascript; charset=utf-8";
    if (/\.css$/i.test(file.path)) return "text/css; charset=utf-8";
    if (/\.html?$/i.test(file.path)) return "text/html; charset=utf-8";
    return "text/plain; charset=utf-8";
  }
  return mime;
}

export function groupMessageFiles(message: Pick<WireMessage, "text" | "attachments" | "legacyHistory">): Array<{ path: string; name?: string; upload?: boolean; href?: boolean }> {
  const text = message.text ?? "";
  const targets = messageFileTargets(text).map((path) => ({ path: message.legacyHistory?.documentLinks?.[path] ?? path, href: true }));
  const tags = [...text.matchAll(/<attached-(?:file|image)\s+path="([^"\r\n]*)"/g)].flatMap((match) => {
    const path = decodeAttachmentAttribute(match[1]!);
    const name = messageAttachmentName(text, path);
    return name ? [{ path, name, upload: true }] : [];
  });
  return [...(message.attachments ?? []).map((file) => ({ path: file.path, name: "name" in file ? file.name : undefined, upload: true })), ...tags, ...targets];
}

type Source = Pick<GroupFile, "role" | "botId" | "messageId" | "threadId" | "todoId">;
const HASH_FILE_LIMIT = 50 * 1024 * 1024;
const HASH_BATCH_BUDGET = 256 * 1024 * 1024;
export class GroupFileChanged extends Error {}

function preserveHistory(file: GroupFile): GroupFile["versions"] {
  const history = [...(file.versions ?? [])];
  const source = { ...(file.messageId ? { messageId: file.messageId } : {}), ...(file.botId ? { botId: file.botId } : {}),
    ...(file.todoId ? { todoId: file.todoId } : {}), ...(file.threadId ? { threadId: file.threadId } : {}) };
  const latest = history.at(-1);
  if (latest) history[history.length - 1] = { ...source, ...latest };
  else if (Object.keys(source).length) history.push({ at: file.updatedAt, size: file.size, ...source });
  return history;
}

export class GroupFiles {
  readonly groupId: string;
  readonly folder: string;
  readonly changed: () => void;
  readonly dataDir: string;
  constructor(groupId: string, folder: string, changed: () => void, dataDir = DATA_DIR) {
    this.groupId = groupId; this.folder = folder; this.changed = changed; this.dataDir = dataDir;
    ensureContextDocument("group", groupId, dataDir);
  }
  private get directory() { return contextDirectory("group", this.groupId, this.dataDir); }
  private read(): GroupFile[] {
    const bytes = readWorkspaceFile(this.directory, "group-files.json", Number.MAX_SAFE_INTEGER);
    if (!bytes) return [];
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    return Array.isArray(value) ? value : [];
  }
  private save(files: GroupFile[]) {
    const retained = files.sort((left, right) => Number(right.root === undefined || right.root === this.folder) - Number(left.root === undefined || left.root === this.folder) || order(left, right)).slice(0, 500);
    const serialized = JSON.stringify(retained.sort(order));
    writeFileAtomic(join(this.directory, "group-files.json"), serialized, { mode: 0o600 });
    this.changed();
  }
  bindLegacyRoot() {
    const files = this.read();
    if (!files.some((file) => file.root === undefined)) return;
    for (const file of files) file.root ??= this.folder;
    this.save(files);
  }
  resolve(file: GroupFile): string | null {
    if ((file.root !== undefined && file.root !== this.folder) || inSecretFolder(file.path) || inSecretFolder(this.folder)) return null;
    const canonical = isAbsolute(file.path)
      ? file.role === "input" ? resolvedGroupFile(join(this.dataDir, "attachments"), file.path) : null
      : resolvedGroupFile(this.folder, file.path);
    return canonical && !inSecretFolder(canonical) ? canonical : null;
  }
  content(fileId: string): { file: GroupFile; bytes: Buffer } | null {
    const files = this.read();
    const file = files.find((entry) => entry.id === fileId);
    if (!file || !this.resolve(file)) return null;
    const bytes = readWorkspaceFile(isAbsolute(file.path) ? join(this.dataDir, "attachments") : this.folder, file.path, 50 * 1024 * 1024);
    if (!bytes) return null;
    const hash = createHash("sha256").update(bytes).digest("hex");
    if ((file.contentHash && file.contentHash !== hash) || (!file.contentHash && file.botId)) {
      const at = Date.now();
      const current = this.resolve(file);
      let observedMtime: number | undefined;
      try { if (current) observedMtime = statSync(current).mtimeMs; } catch { /* The file disappeared. */ }
      const history = preserveHistory(file);
      const observed: GroupFile = {
        id: file.id, root: file.root ?? this.folder, path: file.path, name: file.name, kind: file.kind, role: file.role,
        ...(file.threadId ? { threadId: file.threadId } : {}),
        version: file.version + 1, versions: [...history, { at, size: bytes.length }], size: bytes.length,
        contentHash: hash, revisionVerified: true, ...(observedMtime === undefined ? {} : { observedMtime }),
        createdAt: file.createdAt, updatedAt: at,
      };
      files.splice(files.indexOf(file), 1, observed);
      this.save(files);
      throw new GroupFileChanged("file changed since registration");
    }
    return { file, bytes };
  }
  register(candidates: Array<{ path: string; name?: string; upload?: boolean; href?: boolean }>, source: Source, options?: { preserveExisting?: boolean }): GroupFile[] {
    const files = this.read();
    const added: GroupFile[] = [];
    let remainingHashBytes = HASH_BATCH_BUDGET;
    const seen = new Set<string>();
    for (const candidate of candidates) {
      let path = candidate.path;
      try {
        if (/^file:/i.test(path)) path = fileURLToPath(path);
        else if (/^[a-z][a-z\d+.-]*:/i.test(path)) continue;
        else if (candidate.href) path = decodeURIComponent(path.split(/[?#]/)[0]!);
      } catch { continue; }
      if (inSecretFolder(path) || inSecretFolder(this.folder)) continue;
      const local = resolvedGroupFile(this.folder, path);
      const upload = !local && source.role === "input" && candidate.upload ? resolvedGroupFile(join(this.dataDir, "attachments"), path) : null;
      const canonical = local ?? upload;
      if (!canonical || inSecretFolder(canonical) || seen.has(canonical)) continue;
      seen.add(canonical);
      const storedPath = local ? relative(realpathSync(this.folder), local) : canonical;
      let observed: ReturnType<typeof statSync>;
      try { observed = statSync(canonical); } catch { continue; }
      const { size, mtimeMs } = observed;
      const allowance = Math.min(HASH_FILE_LIMIT, remainingHashBytes);
      const canHash = size <= allowance;
      const bytes = canHash ? readWorkspaceFile(local ? this.folder : join(this.dataDir, "attachments"), storedPath, allowance) : null;
      if (canHash) remainingHashBytes -= bytes ? bytes.length : allowance;
      let after: ReturnType<typeof statSync> | undefined;
      try { if (bytes) after = statSync(canonical); } catch { /* The file changed while being read. */ }
      const stable = after && after.size === size && after.mtimeMs === mtimeMs && after.ctimeMs === observed.ctimeMs && after.ino === observed.ino && after.dev === observed.dev;
      const contentHash = bytes && stable ? createHash("sha256").update(bytes).digest("hex") : undefined;
      const at = Date.now();
      const existing = files.find((file) => (file.root ?? this.folder) === this.folder && file.path === storedPath);
      // Only matching fingerprints prove that an unlinked scan is the same revision.
      const sameRevision = Boolean(existing && !existing.missing && existing.size === size && existing.contentHash && contentHash && existing.contentHash === contentHash);
      const sameUnknownObservation = Boolean(existing && !existing.missing && existing.revisionVerified === false && !contentHash &&
        !existing.botId && existing.size === size && existing.observedMtime === mtimeMs);
      if (options?.preserveExisting && (sameRevision || sameUnknownObservation)) continue;
      if (!contentHash && source.role === "deliverable" && sameUnknownObservation) continue;
      if (existing && existing.messageId === source.messageId && source.messageId && sameRevision) continue;
      const confirmedSource = contentHash || source.role === "input" ? source : { role: source.role, ...(source.threadId ? { threadId: source.threadId } : {}) };
      const version = { at, size, ...(confirmedSource.messageId ? { messageId: confirmedSource.messageId } : {}),
        ...(confirmedSource.botId ? { botId: confirmedSource.botId } : {}), ...(confirmedSource.todoId ? { todoId: confirmedSource.todoId } : {}),
        ...(confirmedSource.threadId ? { threadId: confirmedSource.threadId } : {}) };
      const attributionOnly = Boolean(existing && !existing.botId && source.botId && sameRevision);
      const history = existing ? preserveHistory(existing) : [];
      const file: GroupFile = {
        id: existing?.id ?? randomUUID(), root: this.folder, path: storedPath, name: candidate.name ?? basename(canonical), kind: groupFileKind(candidate.name ?? canonical),
        ...confirmedSource, version: attributionOnly ? existing!.version : (existing?.version ?? 0) + 1,
        versions: attributionOnly ? history.map((entry, index) => index === history.length - 1 ? { ...entry, ...version, at: entry.at } : entry) : [...history, version],
        size, observedMtime: mtimeMs, ...(contentHash ? { contentHash } : {}), revisionVerified: Boolean(contentHash),
        createdAt: existing?.createdAt ?? at, updatedAt: at,
      };
      if (existing) files.splice(files.indexOf(existing), 1);
      files.push(file);
      added.push(file);
    }
    if (added.length) this.save(files);
    return added;
  }
  list(filters: { role?: string; botId?: string; kind?: string; before?: string } = {}): GroupFilesPage {
    const files = this.read();
    let changed = false;
    for (const file of files) {
      if (file.root !== undefined && file.root !== this.folder) continue;
      const verified = typeof file.contentHash === "string" && /^[a-f0-9]{64}$/.test(file.contentHash) && file.revisionVerified !== false;
      if (!verified) {
        if (file.revisionVerified !== false) { file.revisionVerified = false; changed = true; }
        if (file.role === "deliverable" && (file.botId || file.messageId || file.todoId)) {
          file.versions = preserveHistory(file);
          delete file.botId; delete file.messageId; delete file.todoId; changed = true;
        }
      }
      const missing = !this.resolve(file);
      if (missing !== Boolean(file.missing)) { changed = true; if (missing) file.missing = true; else delete file.missing; }
    }
    if (changed) this.save(files);
    let selected = files.sort(order).filter((file) => (file.root ?? this.folder) === this.folder && (!filters.role || file.role === filters.role) && (!filters.botId || file.botId === filters.botId) && (!filters.kind || file.kind === filters.kind));
    if (filters.before) {
      const cursor = selected.findIndex((file) => cursorFor(file) === filters.before);
      selected = cursor >= 0 ? selected.slice(cursor + 1) : [];
    }
    const page = selected.slice(0, 50);
    return { files: page, folder: this.folder, ...(selected.length > 50 ? { next: cursorFor(page.at(-1)!) } : {}) };
  }
  scanDeliverables(since: number): string[] {
    const files: string[] = [];
    const pending = [{ path: join(this.folder, "deliverables"), depth: 0 }];
    let count = 0;
    while (pending.length && count < 2000) {
      const { path, depth } = pending.shift()!;
      let dir;
      try {
        if (lstatSync(path).isSymbolicLink() || !insideFolder(realpathSync(this.folder), realpathSync(path))) continue;
        dir = opendirSync(path);
      } catch { continue; }
      try {
        let entry;
        while (count < 2000 && (entry = dir.readSync())) {
          count += 1;
          if (entry.name.startsWith(".") || entry.isSymbolicLink() || /^(?:test-results?|coverage|tmp|temp)$/i.test(entry.name)) continue;
          const child = join(path, entry.name);
          if (entry.isDirectory() && depth < 3) pending.push({ path: child, depth: depth + 1 });
          if (entry.isFile() && !/^(?:test[-_.]?(?:results?|output)|coverage)(?:[-_.]|$)/i.test(entry.name) && ["doc", "sheet", "slides", "pdf", "markdown", "image"].includes(groupFileKind(entry.name))) {
            const canonical = resolvedGroupFile(this.folder, child);
            if (canonical && statSync(canonical).mtimeMs >= since) files.push(canonical);
          }
        }
      } finally { dir.closeSync(); }
    }
    return files.sort();
  }
}
function order(a: GroupFile, b: GroupFile): number { return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id); }
function cursorFor(file: GroupFile): string { return `${file.updatedAt}:${file.id}`; }
