export const DOCUMENT_TEXT_LIMIT = 2 * 1024 * 1024;
export const DOCUMENT_PDF_LIMIT = 25 * 1024 * 1024;

const LEGACY_STATUS_LABELS: Readonly<Record<string, string>> = {
  "开始处理：supervisor": "主管开始安排",
  "开始处理：delegated": "交给员工处理",
  "开始处理：supervisor_summary": "主管汇总",
  "开始处理：chat": "开始处理消息",
};

export function documentDisplayText(message: { text?: string; legacyHistory?: { source?: string; kind?: string; documentLinks?: Record<string, string> } }): string {
  if (message.legacyHistory?.source === "botdom-python" && message.legacyHistory.kind === "status" && message.text && Object.hasOwn(LEGACY_STATUS_LABELS, message.text)) {
    return LEGACY_STATUS_LABELS[message.text]!;
  }
  const links = message.legacyHistory?.documentLinks;
  return links ? (message.text ?? "").replace(/(\[[^\]]*\]\()([^\s)]+)(\))/g, (match, start: string, path: string, end: string) => Object.hasOwn(links, path) ? `${start}${links[path]}${end}` : match) : message.text ?? "";
}

export function readableDocument(name: string): "markdown" | "pdf" | "docx" | "xlsx" | "pptx" | null {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return extension === "md" || extension === "markdown" ? "markdown"
    : extension === "pdf" || extension === "docx" || extension === "xlsx" || extension === "pptx" ? extension : null;
}

export function documentOnlyText(text: string, files: readonly { kind?: string; name?: string; path: string }[]): boolean {
  const documents = files.filter(file => file.kind === "file" && readableDocument(file.name ?? file.path));
  if (!documents.length || documents.length !== files.length) return false;
  const names = new Set(documents.map(file => file.name ?? file.path.split(/[\\/]/).pop()!));
  return !text.trim() || text.trim().split(/\r?\n/).every(line => {
    const value = line.trim();
    if (names.has(value) || documents.some(file => file.path === value)) return true;
    const relative = value.replace(/^`|`$/g, "").replace(/^\.\//, "");
    if (/[\\/]/.test(relative) && !/\s/.test(relative) && names.has(relative.split(/[\\/]/).pop()!)) return true;
    return /^delivered\s+/i.test(value) && names.has(value.replace(/^delivered\s+/i, "").trim().split(/[\\/]/).pop()!);
  });
}

export async function readDocumentBytes(response: Response, signal: AbortSignal, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  if (signal.aborted) { await response.body?.cancel(signal.reason).catch(() => {}); signal.throwIfAborted(); }
  if (Number(response.headers.get("content-length")) > maximum) { await response.body?.cancel(); throw new Error("size"); }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.length;
      if (size > maximum) throw new Error("size");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
