type Room = { id: string; dm?: boolean; supervisorId?: string; defaultResponder: { kind: string; botId?: string } };
type Agent = { id: string; name: string; supervisorGroupId?: string };

export function supervisorRoomId(bot: Agent, groups: readonly Room[]): string | undefined {
  if (bot.supervisorGroupId) return bot.supervisorGroupId;
  return groups.find((group) => !group.dm && (group.supervisorId === bot.id ||
    (/^(主管(?:\s|[·:：])|Supervisor\s*[·:：])/i.test(bot.name) && group.defaultResponder.kind === "member" && group.defaultResponder.botId === bot.id)))?.id;
}

export function isRoomSupervisor(bot: Agent, groups: readonly Room[]): boolean {
  return supervisorRoomId(bot, groups) !== undefined;
}
