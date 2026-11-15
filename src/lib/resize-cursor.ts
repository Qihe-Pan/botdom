const holders = new Set<string>();

/** While any edge is being dragged the whole page shows the resize cursor and selects no text. Each edge only adds or
 * removes itself, so one edge ending can never leave another's cursor behind, and nothing restores a stale inline value. */
export function holdResizeCursor(holder: string, held: boolean): void {
  if (held) holders.add(holder); else holders.delete(holder);
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (holders.size) root.dataset.resizing = ""; else delete root.dataset.resizing;
}
