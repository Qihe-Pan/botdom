import type { ModelSelection, WireBot, WireGroup } from "./wire.ts";

export interface CreateGroupWithEmployeesRequest {
  name: string;
  supervisor: ModelSelection;
  employees: Array<ModelSelection & { count: number }>;
}
export interface CreateGroupWithEmployeesResponse { group: WireGroup; employees: WireBot[] }
