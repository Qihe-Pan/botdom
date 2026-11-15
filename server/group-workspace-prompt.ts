import type { GroupFile } from "../shared/group-workspace.ts";
import { ROOM_TODO_OPEN, type RoomTodo } from "../shared/room-todo.ts";

function compact(value: string, bytes: number): string {
  let result = "";
  for (const character of value.replace(/\s+/g, " ").trim()) {
    if (Buffer.byteLength(result + character) > bytes) return result + "…";
    result += character;
  }
  return result;
}

function excerpt(lines: string[], bytes: number): string {
  if (!lines.length) return "-\n";
  let result = "";
  for (const line of lines) {
    if (Buffer.byteLength(result + line + "\n") > bytes) break;
    result += line + "\n";
  }
  return result || "…\n";
}

export function formatGroupWorkspacePrompt(args: { folder: string; index: string; files: GroupFile[]; todos: RoomTodo[]; nameOf: (id: string) => string; fileStatus?: (file: GroupFile) => string | undefined }): string {
  const header = `\n\n群工作区：${compact(args.folder, 300)}\nEdit files in place where the goal or project keeps them, the project's own tests included. Only a standalone output with no place in the project goes in deliverables/<task id>/; attach them in your reply. Scratch and intermediate files go in .work/; do not attach them. Record important decisions in the shared group documents.\n`;
  const todos = args.todos.filter((todo) => ROOM_TODO_OPEN.has(todo.status)).map((todo) => `${compact(todo.id, 40)} ${todo.status} ${compact(todo.assigneeId ? args.nameOf(todo.assigneeId) : "unassigned", 40)}`);
  const index = args.index.split("\n").filter(Boolean).slice(0, 12).map((line) => compact(line, 180));
  const titles = ["最近文件：\n", "任务板（未关闭）：\n", "群文档索引（节选，按需读取）：\n"];
  const available = 1500 - Buffer.byteLength(header + titles.join(""));
  const fileBudget = Math.floor(available * 0.55);
  const todoBudget = Math.floor(available * 0.22);
  const recent = [...args.files].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, 8);
  const rowBudget = recent.length ? Math.floor(fileBudget / recent.length) - 1 : fileBudget;
  const files = recent.map((file) => {
    const verified = Boolean(file.contentHash && /^[a-f0-9]{64}$/.test(file.contentHash)) && file.revisionVerified !== false;
    const status = verified ? args.fileStatus?.(file) ?? args.todos.find((todo) => todo.id === file.todoId)?.status ?? "-" : "unverified";
    const author = file.role === "input" ? "user" : verified && file.botId ? args.nameOf(file.botId) : "unknown";
    const todoId = verified ? file.todoId ?? "-" : "-";
    const fieldsBudget = Math.max(4, rowBudget - Buffer.byteLength(` |  |  |  ${status}`) - 12);
    return `${compact(file.name, Math.floor(fieldsBudget * 0.25))} | ${compact(file.path, Math.floor(fieldsBudget * 0.45))} | ${compact(author, Math.floor(fieldsBudget * 0.18))} | ${compact(todoId, Math.floor(fieldsBudget * 0.12))} ${status}`;
  });
  return header + titles[0] + excerpt(files, fileBudget) + titles[1] + excerpt(todos, todoBudget) + titles[2] + excerpt(index, available - fileBudget - todoBudget);
}
