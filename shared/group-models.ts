import type { EffortLevel, ModelSelection } from "./wire.ts";

export interface GroupModelChange { botId: string; model: string; effort?: EffortLevel; variant?: string }
export interface GroupModelChangesRequest { changes: GroupModelChange[] }
export interface GroupModelChangesResponse { bots: Array<{ botId: string; modelSelection: ModelSelection }>; memberModels: Record<string, ModelSelection> }

export function roomMemberModel(group: { dm?: boolean; memberModels?: Record<string, ModelSelection> }, bot: { id: string; modelSelection: ModelSelection }): ModelSelection {
  const saved = group.dm ? undefined : group.memberModels?.[bot.id];
  return saved?.instanceId === bot.modelSelection.instanceId ? saved : bot.modelSelection;
}
