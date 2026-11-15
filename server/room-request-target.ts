export type RoomRequestTarget =
  | { kind: "unique"; executionId: string }
  | { kind: "missing" }
  | { kind: "ambiguous" };

/** Resolve only against live executions and their server-owned request-to-card mappings. */
export function roomRequestTarget(
  roomThreadId: string,
  requestId: string,
  cardMessageId: string | undefined,
  executions: ReadonlyMap<string, { threadId: string }>,
  cards: ReadonlyMap<string, string>,
): RoomRequestTarget {
  const matches: string[] = [];
  for (const [executionId, execution] of executions) {
    if (execution.threadId !== roomThreadId) continue;
    const messageId = cards.get(`${executionId}:${requestId}`);
    if (messageId && (cardMessageId === undefined || cardMessageId === messageId)) matches.push(executionId);
  }
  if (matches.length === 0) return { kind: "missing" };
  if (matches.length > 1) return { kind: "ambiguous" };
  return { kind: "unique", executionId: matches[0]! };
}
