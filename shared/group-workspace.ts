/** A file the group produced or was given, registered by the server from real turns and uploads. */
export interface GroupFile {
  id: string;
  /** Working-folder root associated with this record. */
  root?: string;
  /** Relative to the group's working folder; absolute only for an upload kept outside it. */
  path: string;
  name: string;
  kind: GroupFileKind;
  role: "deliverable" | "input";
  /** Who produced it; absent for the person's uploads. */
  botId?: string;
  messageId?: string;
  /** The task-board item it belongs to; its acceptance state is read from that item. */
  todoId?: string;
  threadId?: string;
  version: number;
  versions: Array<{ at: number; size: number; messageId?: string; botId?: string; todoId?: string; threadId?: string }>;
  size: number;
  /** SHA-256 of observed bytes when the file is readable within the download limit. */
  contentHash?: string;
  /** False when this observation could not be fingerprinted; its current authorship is unconfirmed. */
  revisionVerified?: boolean;
  /** File mtime at registration, used to distinguish attribution from a new revision. */
  observedMtime?: number;
  /** The file is gone from disk. */
  missing?: true;
  createdAt: number;
  updatedAt: number;
}

export type GroupFileKind = "doc" | "sheet" | "slides" | "pdf" | "markdown" | "image" | "code" | "other";

/** GET /api/groups/:id/files?role=&botId=&kind=&before= */
export interface GroupFilesPage {
  files: GroupFile[];
  /** Pass as `before` for the next page. */
  next?: string;
  /** The group's working folder, absolute. */
  folder: string;
}

/** One shared note under the group's notes folder, as the index lists it. */
export interface GroupDocSummary {
  /** File name without folder, e.g. "decisions.md". */
  name: string;
  title: string;
  /** First sentence, at most 140 characters. */
  summary: string;
  bytes: number;
  updatedAt: number;
  /** A bot id, or "user". */
  updatedBy?: string;
  messageId?: string;
  /** Not updated for 90 days. */
  stale?: true;
}

/** GET /api/groups/:id/docs */
export interface GroupDocsList {
  docs: GroupDocSummary[];
}

/** GET /api/groups/:id/docs/:name ; PUT with { text, baseUpdatedAt } answers the same shape, 409 when the base is stale. */
export interface GroupDoc extends GroupDocSummary {
  text: string;
}

export const GROUP_DOC_MAX_BYTES = 20_000;
export const GROUP_DOC_NAME = /^[a-z0-9][a-z0-9-]{0,62}\.md$/;
