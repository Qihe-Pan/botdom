import { type WireMessage } from "../shared/wire.ts";
import { DATA_DIR } from "./config.ts";
import { GroupDocs } from "./group-docs.ts";
import { GroupFiles, groupMessageFiles } from "./group-files.ts";
import { ensureGroupWorkspace, readWorkspaceFile } from "./group-workspace.ts";
import { CONTEXT_INDEX_MAX_BYTES, contextDirectory } from "./context-documents.ts";
import { formatGroupWorkspacePrompt } from "./group-workspace-prompt.ts";
import type { GroupRecord, Store } from "./store.ts";

type WorkspaceStore = Pick<Store, "group" | "groupByThread" | "patchGroup" | "groupTaskByThread" | "messagesFor" | "bot">;
export class GroupWorkspaceService {
  readonly store: WorkspaceStore;
  readonly dataDir: string;
  private readonly activeTurns = new Map<string, { startedAt: number; overlapped: boolean; turns: Set<object>; threadIds: Set<string> }>();
  constructor(store: WorkspaceStore, dataDir = DATA_DIR) { this.store = store; this.dataDir = dataDir; }
  changed = (groupId: string): void => {
    const group = this.store.group(groupId);
    if (group && !group.dm) this.store.patchGroup(groupId, { workspaceRevision: (group.workspaceRevision ?? 0) + 1 });
  };
  private resources(group: GroupRecord) {
    const folder = ensureGroupWorkspace(this.store, group, this.dataDir);
    const changed = () => this.changed(group.id);
    return { folder, files: new GroupFiles(group.id, folder, changed, this.dataDir), docs: new GroupDocs(group.id, changed, this.dataDir) };
  }
  /** Before the room's folder moves: tag the files indexed so far with the folder they live in. */
  sealFolder(group: GroupRecord): void {
    if (!group.dm && group.cwd) new GroupFiles(group.id, group.cwd, () => this.changed(group.id), this.dataDir).bindLegacyRoot();
  }
  userMessage(threadId: string, message: WireMessage): void {
    if (message.role !== "user") return;
    const group = this.store.groupByThread(threadId);
    if (!group || group.dm) return;
    const candidates = groupMessageFiles(message).filter((file) => file.upload);
    if (candidates.length) this.resources(group).files.register(candidates, { role: "input", messageId: message.id, threadId });
  }
  beginTurn(group: GroupRecord, threadId: string, botId: string) {
    if (group.dm) return undefined;
    const { files, docs } = this.resources(group);
    const snapshot = docs.snapshot();
    const previousMessages = new Set(this.store.messagesFor(threadId).map((message) => message.id));
    const startedAt = Date.now();
    let active = this.activeTurns.get(group.id);
    if (!active) {
      active = { startedAt, overlapped: false, turns: new Set(), threadIds: new Set() };
      this.activeTurns.set(group.id, active);
    }
    if (active.turns.size) active.overlapped = true;
    active.threadIds.add(threadId);
    const token = {};
    active.turns.add(token);
    const batch = active;
    return () => {
      if (!batch.turns.delete(token)) return;
      try {
        if (!this.store.group(group.id)) return;
        const replies = this.store.messagesFor(threadId).filter((message) => !previousMessages.has(message.id) && message.role === "bot" && message.from?.botId === botId);
        const reply = [...replies].reverse().find((message) => message.kind === "text") ?? replies.at(-1);
        const todo = this.store.groupTaskByThread(group.id, threadId)?.todos?.filter((item) => item.assigneeId === botId && (item.status === "working" || item.status === "reported")).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
        const source = { role: "deliverable" as const, botId, messageId: reply?.id, threadId, todoId: todo?.id };
        const explicit = replies.flatMap(groupMessageFiles);
        if (batch.overlapped) {
          // Other employees may have written any unlinked file or note. Only
          // explicit reply links establish authorship; discovered files
          // without such a link are registered without guessing a source.
          files.register(explicit, source);
          docs.afterTurn(snapshot, "unknown");
          const knownThread = batch.threadIds.size === 1 ? [...batch.threadIds][0] : undefined;
          files.register(files.scanDeliverables(batch.startedAt).map((path) => ({ path })), { role: "deliverable", ...(knownThread ? { threadId: knownThread } : {}) }, { preserveExisting: true });
        } else {
          const scanned = files.scanDeliverables(startedAt).map((path) => ({ path }));
          files.register([...explicit, ...scanned], source);
          docs.afterTurn(snapshot, botId, reply?.id);
        }
      } finally {
        if (!batch.turns.size) this.activeTurns.delete(group.id);
      }
    };
  }
  prompt(group: GroupRecord, threadId: string): string {
    if (group.dm) return "";
    const { folder, files } = this.resources(group);
    const index = readWorkspaceFile(contextDirectory("group", group.id, this.dataDir), "CONTEXT.md", CONTEXT_INDEX_MAX_BYTES, true)?.toString("utf8").replace(/�+$/, "") ?? "";
    return formatGroupWorkspacePrompt({ folder, index, files: files.list().files, todos: this.store.groupTaskByThread(group.id, threadId)?.todos ?? [], nameOf: (id) => this.store.bot(id)?.name ?? id, fileStatus: (file) => file.threadId ? this.store.groupTaskByThread(group.id, file.threadId)?.todos?.find((todo) => todo.id === file.todoId)?.status : undefined });
  }
}
