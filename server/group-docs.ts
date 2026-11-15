import { lstatSync, readdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { GROUP_DOC_MAX_BYTES, GROUP_DOC_NAME, type GroupDoc, type GroupDocsList } from "../shared/group-workspace.ts";
import { writeFileAtomic, writeFileAtomicIfChanged } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";
import { CONTEXT_INDEX_MAX_BYTES, CONTEXT_INDEX_MAX_LINES, contextDirectory, ensureContextDocument } from "./context-documents.ts";
import { insideFolder, readWorkspaceFile } from "./group-workspace.ts";

type NoteMeta = { updatedBy: string; messageId?: string; updatedAt: number };
export type GroupDocsSnapshot = Map<string, number>;
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const singleLine = (text: string) => text.replace(/\s+/g, " ").trim();

export class GroupDocs {
  readonly groupId: string;
  readonly changed: () => void;
  readonly dataDir: string;
  constructor(groupId: string, changed: () => void, dataDir = DATA_DIR) {
    this.groupId = groupId; this.changed = changed; this.dataDir = dataDir;
    ensureContextDocument("group", groupId, dataDir);
  }
  private get directory() { return contextDirectory("group", this.groupId, this.dataDir); }
  private get notes() {
    const folder = join(this.directory, "notes");
    if (lstatSync(folder).isSymbolicLink() || !insideFolder(realpathSync(this.directory), realpathSync(folder))) throw fail(404, "notes folder unavailable");
    return folder;
  }
  private path(name: string): string {
    if (!GROUP_DOC_NAME.test(name)) throw fail(400, "invalid note name");
    const path = join(this.notes, name);
    try { if (!lstatSync(path).isFile()) throw fail(404, "note unavailable"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return path;
  }
  private metadata(): Record<string, NoteMeta> {
    const bytes = readWorkspaceFile(this.notes, ".meta.json", 1_000_000);
    return bytes ? JSON.parse(bytes.toString("utf8")) : {};
  }
  private saveMeta(meta: Record<string, NoteMeta>) {
    writeFileAtomic(join(this.notes, ".meta.json"), JSON.stringify(meta), { mode: 0o600 });
  }
  read(name: string, now = Date.now()): GroupDoc {
    const path = this.path(name);
    const bytes = readWorkspaceFile(this.notes, name, GROUP_DOC_MAX_BYTES);
    if (!bytes) throw fail(404, "no such note");
    const text = bytes.toString("utf8");
    const updatedAt = statSync(path).mtimeMs;
    const meta = this.metadata()[name];
    const heading = text.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/m)?.[1];
    const body = singleLine(text.replace(/^ {0,3}#{1,6}\s+.*$/gm, "").replace(/[`*_>]/g, ""));
    const summary = (body.match(/^.*?(?:[。！？]|[.!?](?:\s|$))/)?.[0] ?? body).trim().slice(0, 140);
    return {
      name, title: singleLine(heading ?? name), summary, text, bytes: bytes.length, updatedAt,
      ...(meta && meta.updatedAt === updatedAt ? { updatedBy: meta.updatedBy, ...(meta.messageId ? { messageId: meta.messageId } : {}) } : {}),
      ...(now - updatedAt > 90 * 24 * 60 * 60 * 1000 ? { stale: true as const } : {}),
    };
  }
  list(): GroupDocsList {
    const docs = readdirSync(this.notes).filter((name) => GROUP_DOC_NAME.test(name)).sort().flatMap((name) => {
      try { const { text: _text, ...summary } = this.read(name); return [summary]; }
      catch (error) { if ((error as { status?: number }).status === 404) return []; throw error; }
    });
    return { docs };
  }
  write(name: string, text: unknown, baseUpdatedAt?: unknown): GroupDoc {
    const path = this.path(name);
    if (typeof text !== "string" || Buffer.byteLength(text) > GROUP_DOC_MAX_BYTES) throw fail(400, `text must fit within ${GROUP_DOC_MAX_BYTES} bytes`);
    if (baseUpdatedAt !== undefined && (typeof baseUpdatedAt !== "number" || !Number.isFinite(baseUpdatedAt))) throw fail(400, "invalid baseUpdatedAt");
    try {
      if (typeof baseUpdatedAt === "number" && baseUpdatedAt < statSync(path).mtimeMs) throw fail(409, "note changed since it was read");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    writeFileAtomic(path, text, { mode: 0o600 });
    this.saveMeta({ ...this.metadata(), [name]: { updatedBy: "user", updatedAt: statSync(path).mtimeMs } });
    this.regenerateIndex();
    this.changed();
    return this.read(name);
  }
  delete(name: string): void {
    const path = this.path(name);
    try { unlinkSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw fail(404, "no such note"); throw error; }
    const meta = this.metadata();
    delete meta[name];
    this.saveMeta(meta);
    this.regenerateIndex();
    this.changed();
  }
  snapshot(): GroupDocsSnapshot {
    return new Map(this.list().docs.map((doc) => [doc.name, doc.updatedAt]));
  }
  afterTurn(before: GroupDocsSnapshot, botId: string, messageId?: string): boolean {
    const docs = this.list().docs;
    const meta = this.metadata();
    let changed = false;
    for (const doc of docs) {
      if (before.get(doc.name) === doc.updatedAt || meta[doc.name]?.updatedAt === doc.updatedAt) continue;
      meta[doc.name] = { updatedBy: botId, messageId, updatedAt: doc.updatedAt };
      changed = true;
    }
    const names = new Set(docs.map((doc) => doc.name));
    for (const name of before.keys()) if (!names.has(name)) { delete meta[name]; changed = true; }
    if (changed) { this.saveMeta(meta); this.regenerateIndex(); this.changed(); }
    return changed;
  }
  regenerateIndex(): void {
    const lines = ["# 群聊上下文索引", "", "应用自动维护本索引；Bot 只写 notes/<topic>.md。按需读取相关笔记；任务状态以群任务板为准。"];
    for (const doc of this.list().docs) {
      const line = `- notes/${doc.name} — ${doc.title.slice(0, 140)}: ${doc.summary} (updated ${new Date(doc.updatedAt).toISOString().slice(0, 10)} by ${singleLine(doc.updatedBy ?? "unknown")})`;
      if (lines.length >= CONTEXT_INDEX_MAX_LINES || Buffer.byteLength([...lines, line, ""].join("\n")) > CONTEXT_INDEX_MAX_BYTES) break;
      lines.push(line);
    }
    writeFileAtomicIfChanged(join(this.directory, "CONTEXT.md"), lines.join("\n") + "\n", { mode: 0o600 });
  }
}
