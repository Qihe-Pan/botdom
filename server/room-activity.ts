export function activeRoomMemberThread(
  botId: string,
  speakers: Iterable<readonly [string, { botId: string }]>,
  operations: Iterable<{ id: string; threadId: string; cancelled: boolean }>,
  reservation: string | undefined,
): string | undefined {
  for (const [threadId, speaker] of speakers) {
    if (speaker.botId === botId) return threadId;
  }
  for (const operation of operations) {
    if (!operation.cancelled && operation.id === reservation) return operation.threadId;
  }
  return undefined;
}
