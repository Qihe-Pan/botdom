import type { RoomTodo } from "../shared/room-todo.ts";
import type { GoalReport } from "./group-goal-run.ts";
import type { RoomLine } from "./host/room-transcript.ts";
import { escapeNotes } from "./peer-provenance.ts";
import type { Message } from "./store.ts";

/** Use the board's verified report identity only if the exact report is in this turn's window.
 * This is an ephemeral projection, not a replacement for the archived message or recovery checkpoint. */
export function goalReportCheckpoint(
  reports: readonly GoalReport[], todos: readonly RoomTodo[], messages: readonly Message[], lines: readonly RoomLine[],
): string {
  const byId = new Map(messages.map(message => [message.id, message]));
  const shown = new Map(lines.map(line => [line.id, line.text]));
  return reports.map(report => {
    const todo = report.todoId ? todos.find(item => item.id === report.todoId) : undefined;
    const message = todo?.reportMessageId ? byId.get(todo.reportMessageId) : undefined;
    const line = message && shown.get(message.id);
    const body = escapeNotes(report.text.trim());
    // A name-only reference would be ambiguous if a different bot with that name is visible.
    const ambiguous = lines.some(item => {
      const other = byId.get(item.id);
      return other?.role === "bot" && other.from?.name === report.name && other.from.botId !== report.botId;
    });
    const exact = body && message?.role === "bot" && message.kind === "text" && !message.webhookPost
      && !ambiguous && message.from?.name === report.name && message.from.botId === report.botId && message.text?.trim() === report.text.trim()
      && line && (line.includes(body) || line.includes(JSON.stringify(body).slice(1, -1)));
    const reference = `${report.name}: Full verified report is in the conversation above.`;
    const original = `${report.name}: ${report.text}`;
    return exact && reference.length < original.length ? reference : original;
  }).join("\n");
}
