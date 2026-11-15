export const WORK_BOARD_LANES = ["todo", "working", "blocked", "review", "done"] as const;
export type WorkBoardLane = typeof WORK_BOARD_LANES[number];
export interface BoardColumnPreferences { closed: WorkBoardLane[]; recent: WorkBoardLane[] }

export function workBoardLayout(width: number, lanes: readonly WorkBoardLane[], occupied: readonly WorkBoardLane[], preferences: BoardColumnPreferences) {
  const gap = width < 520 ? 6 : 10;
  const rail = width < 520 ? 32 : 44;
  const capacity = Math.max(1, Math.min(lanes.length, Math.floor((width - gap * (lanes.length - 1) - rail * lanes.length) / (220 - rail))));
  const candidates = [...new Set([...preferences.recent, ...occupied])].filter(lane => lanes.includes(lane) && !preferences.closed.includes(lane));
  const expanded = (candidates.length ? candidates : [occupied.find(lane => lanes.includes(lane)) ?? lanes[0]]).slice(0, capacity);
  return { gap, rail, expanded, columns: lanes.map(lane => `minmax(${rail}px, ${expanded.includes(lane) ? 1 : 0}fr)`).join(" ") };
}
