import type { ModelSelection } from "./wire.ts";

/** Existing bots and conversations keep their selected Harness account; only its model controls may change. */
export function modelHarnessChangeError(current: ModelSelection, next: ModelSelection): string | null {
  return current.instanceId === next.instanceId ? null : "This Harness is fixed. Choose a model from the current Harness, or create another bot.";
}
