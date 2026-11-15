import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { holdResizeCursor } from "@/lib/resize-cursor";

const KEY = "botdom.botPanelWidth";
const MIN = 340;
const MAX = 680;

function load(): number | null {
  try { const value = Number(localStorage.getItem(KEY)); return Number.isFinite(value) && value >= MIN ? value : null; } catch { return null; }
}
function clamp(width: number): number {
  const room = typeof window === "undefined" ? MAX : Math.max(MIN, window.innerWidth - 420);
  return Math.round(Math.min(Math.max(width, MIN), Math.min(MAX, room)));
}

/** The bot panel's width: dragged from its left edge, remembered on this client, reset by double-click. */
export function useBotPanelWidth() {
  const [width, setWidth] = useState<number | null>(load);
  const dragging = useRef<{ x: number; from: number } | null>(null);
  const save = (next: number | null) => {
    setWidth(next);
    try { if (next === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(next)); } catch { /* per-client only */ }
  };
  useEffect(() => () => holdResizeCursor("bot-panel", false), []);
  const start = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const panel = event.currentTarget.parentElement;
    const from = panel?.getBoundingClientRect().width ?? 420;
    dragging.current = { x: event.clientX, from };
    holdResizeCursor("bot-panel", true);
    const move = (e: globalThis.PointerEvent) => {
      if (!dragging.current) return;
      const next = clamp(dragging.current.from + (dragging.current.x - e.clientX));
      panel?.style.setProperty("--bot-panel-w", `${next}px`);
    };
    const up = (e: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      holdResizeCursor("bot-panel", false);
      if (dragging.current) save(clamp(dragging.current.from + (dragging.current.x - e.clientX)));
      dragging.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);
  const key = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 8 : 24;
    const current = width ?? (event.currentTarget.parentElement?.getBoundingClientRect().width ?? 420);
    if (event.key === "ArrowLeft") { event.preventDefault(); save(clamp(current + step)); }
    else if (event.key === "ArrowRight") { event.preventDefault(); save(clamp(current - step)); }
    else if (event.key === "Home") { event.preventDefault(); save(null); }
  }, [width]);
  const style: CSSProperties | undefined = width ? ({ "--bot-panel-w": `${width}px` } as CSSProperties) : undefined;
  return { style, start, key, reset: () => save(null) };
}
