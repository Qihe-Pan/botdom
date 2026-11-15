// The one short line a trace shows beside a tool: the query, the page, the action. Typed text, messages and file bodies are
// never kept, and every line passes the secret redaction before it is stored.
import { redactSecretsInText } from "../../shared/redact.ts";
import { stripVTControlCharacters } from "node:util";
import { TOOL_NAMESPACE } from "../../shared/tool-surface.ts";
import { isQuotaExhausted, quotaExhaustedMessage } from "../drivers/quota-errors.ts";

export const DETAIL_MAX = 80;
export const ERROR_MAX = 120;

const clip = (text: string, max: number): string | undefined => {
  const flat = redactSecretsInText(text.replace(/\s+/g, " ").trim());
  if (!flat) return undefined;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function fieldsOf(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === "object" && !Array.isArray(input)) return input as Record<string, unknown>;
  if (typeof input !== "string" || !/^\s*\{/.test(input)) return null;
  try {
    const parsed: unknown = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function pageOf(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.host.replace(/^www\./, "")}${path}`;
  } catch {
    return undefined;
  }
}

const QUERY_KEYS = ["query", "q", "search", "search_query", "pattern", "searchTerm"];
const PAGE_KEYS = ["url", "uri", "href", "link"];
const FILE_KEYS = ["file_path", "filePath", "path", "notebook_path", "file"];
const ACTION_KEYS = ["action", "operation", "method", "kind"];

export function traceToolName(name: string, input: unknown): string {
  if (/^[\w.:-]{1,128}$/.test(name)) return name;
  const fields = fieldsOf(input);
  return fields && [fields.command, fields.cmd, fields.script].some((value) => typeof value === "string") ? "shell" : "tool";
}

/** A tool's detail from its call: a shell summary, a parsed preview, or nothing. Never the raw arguments. */
export function toolDetail(name: string, input: unknown, summary?: string): string | undefined {
  const fields = fieldsOf(input);
  const command = fields?.command ?? fields?.cmd ?? fields?.script;
  if (typeof command === "string") {
    const words = /^\s*([\w./-]+)(?:\s+([a-z][\w-]*))?/.exec(command);
    const executable = words?.[1]?.split("/").at(-1);
    return executable ? clip([executable, /^(?:pnpm|npm|git|cargo|go)$/.test(executable) ? words?.[2] : undefined].filter(Boolean).join(" "), DETAIL_MAX) : "Shell command";
  }
  if (/^(?:bash|shell|terminal|exec|exec_command|vm_exec|run_command)$/i.test(name.replace(TOOL_NAMESPACE, ""))) return "Shell command";
  if (summary && name !== "tool") return clip(summary, DETAIL_MAX);
  if (!fields) return undefined;
  const text = (key: string) => typeof fields[key] === "string" ? (fields[key] as string) : undefined;
  for (const key of QUERY_KEYS) if (text(key)) return clip(text(key)!, DETAIL_MAX);
  for (const key of PAGE_KEYS) {
    const page = text(key) && pageOf(text(key)!);
    if (page) return clip(page, DETAIL_MAX);
  }
  for (const key of FILE_KEYS) {
    const path = text(key);
    if (path) return clip(path.split(/[\\/]/).filter(Boolean).slice(-2).join("/"), DETAIL_MAX);
  }
  const bare = name.replace(TOOL_NAMESPACE, "");
  for (const key of ACTION_KEYS) if (text(key)) return clip(text(key)!.replace(/[_-]+/g, " "), DETAIL_MAX);
  if (typeof fields.name === "string" && /^(?:use_tool|call_tool)$/.test(bare)) return clip(fields.name, DETAIL_MAX);
  if (Array.isArray(fields.coordinate) && fields.coordinate.length === 2) return clip(`at ${fields.coordinate.join(", ")}`, DETAIL_MAX);
  return undefined;
}

/** A page title a browser tool reported, when its output states one. */
export function pageTitle(output: unknown): string | undefined {
  if (typeof output !== "string") return undefined;
  const match = /(?:^|\n|"|\b)(?:page )?title["']?\s*[:=]\s*["']?([^"'\n]{1,120})/i.exec(output);
  return match ? clip(match[1]!, 60) : undefined;
}

export function toolFailure(output: unknown): { error?: string; exitCode?: number } {
  const messages: string[] = [];
  let exitCode: number | undefined;
  let budget = 64;
  let incomplete = false;
  const visit = (value: unknown, depth = 0): void => {
    if (--budget < 0 || depth > 6 || value == null) return;
    if (typeof value === "string") {
      if (value.length > 32_768) {
        incomplete = true;
        return;
      }
      const trimmed = value.trim();
      if (/^[{["]/.test(trimmed)) {
        try { visit(JSON.parse(trimmed), depth + 1); }
        catch {
          incomplete = true;
          for (const match of trimmed.matchAll(/"(message|error|output|stderr|text)"\s*:\s*("(?:[^"\\]|\\.)*")/g)) {
            try { visit(JSON.parse(match[2]!), depth + 1); } catch {}
          }
          const code = /"exit_?code"\s*:\s*(-?\d+)/i.exec(trimmed)?.[1];
          if (code !== undefined) exitCode = Number(code);
        }
      } else if (trimmed) messages.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 16)) visit(child, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const fields = value as Record<string, unknown>;
    const code = fields.exitCode ?? fields.exit_code;
    if (typeof code === "number" && Number.isSafeInteger(code)) exitCode = code;
    for (const key of ["error", "message", "stderr", "output", "aggregatedOutput", "text", "content", "result"]) visit(fields[key], depth + 1);
  };
  visit(output);
  const reason = messages.map(diagnosticLine).find(Boolean);
  const code = exitCode !== undefined ? `exit code ${exitCode}` : undefined;
  const suffix = code ? ` (${code})` : "";
  const error = clip(reason ? `${clip(reason, ERROR_MAX - suffix.length)}${suffix}`
    : code ? `Command reported failure (${code})`
    : incomplete ? "Error details unavailable (incomplete structured output)" : "", ERROR_MAX);
  return { ...(error ? { error } : {}), ...(exitCode !== undefined ? { exitCode } : {}) };
}

export function errorLine(output: unknown): string | undefined {
  return toolFailure(output).error;
}

function diagnosticLine(text: string): string | undefined {
  const safe = redactSecretsInText(stripVTControlCharacters(text)
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, (url) => pageOf(url) ?? "[address omitted]"))
    .replace(/\b(cookie|set-cookie|authorization|password|token|secret|api[_-]?key)\b["']?\s*[:=]\s*[^\r\n]+/gi, "$1: [redacted]");
  let fallback: string | undefined;
  for (const raw of safe.split(/\r?\n/).slice(0, 80)) {
    const line = raw.trim();
    if (!line || line.length > 512 || /^[{[}\]`]|^\s*at\s|^\^|^\d+\s*[|:]/.test(line)) continue;
    if (isQuotaExhausted(line)) return quotaExhaustedMessage("AI");
    if (/\b(?:SyntaxError|syntax error|unexpected EOF|unexpected token|unterminated|invalid or unexpected token)\b/i.test(line)) return "Command or script syntax error";
    if (/\b(?:ENOENT|no such file or directory|cannot find (?:module|path)|could not resolve|failed to load config)\b/i.test(line)) return "File, module or configuration path not found";
    if (/\bcommand not found\b/i.test(line)) return "Command not found";
    if (/\b(?:Permission denied|EACCES)\b/i.test(line)) return "Permission denied";
    if (/\b(?:command failed|failed command)\b|\b(?:script|command|cmd):/i.test(line)) return "Command failed";
    const tests = /\b(\d+) (?:tests? (?:failed|failing)|failed tests?)\b/i.exec(line);
    if (tests) return `${/^Error:/i.test(line) ? "Error: " : ""}${tests[1]} tests failed`;
    if (/\b(?:FAIL|AssertionError|Test Files\s+\d+ failed)\b/.test(line)) return "Test or assertion failed";
    if (/[{};`]|=>|\$\(|<<|\b(?:const|let|var|import|export|function|echo|print|console\.|raise|def|return)\b|\b[\w.]+\(|^\w+\s*=|^#!/.test(line)) continue;
    if (/\b(?:error|failed|failure|unable|cannot|not found|not visible|not allowed|denied|unauthorized|timed? out|timeout|network|ECONN\w+|EPIPE|ETIMEDOUT|stopped|cancelled|canceled|overloaded|authentication|limit|invalid|expired|refused|unavailable)\b/i.test(line)) fallback ??= line;
  }
  return fallback;
}
