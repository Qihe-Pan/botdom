import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { holdResizeCursor } from "@/lib/resize-cursor";

const PANEL_WIDTH_KEY = "omb-computer-panel-width";
export const PANEL_MIN_WIDTH = 360;
export const PANEL_MAX_WIDTH = 960;
const PANEL_DEFAULT_WIDTH = 400;
const PANEL_RESIZE_STEP = 40;

interface PanelResizeOptions { storageKey?: string; minWidth?: number; maxWidth?: number; defaultWidth?: number; preserveChat?: boolean; centered?: boolean }

function readPanelWidth(key: string, min: number, max: number, fallback: number): number {
  try {
    const stored = Number(localStorage.getItem(key));
    if (Number.isFinite(stored) && stored >= min && stored <= max) return stored;
  } catch {
  }
  return fallback;
}

export function useComputerPanelResize({ storageKey = PANEL_WIDTH_KEY, minWidth = PANEL_MIN_WIDTH, maxWidth = PANEL_MAX_WIDTH, defaultWidth = PANEL_DEFAULT_WIDTH, preserveChat = false, centered = false }: PanelResizeOptions = {}) {
  const [preferredWidth, setPreferredWidth] = useState(() => readPanelWidth(storageKey, minWidth, maxWidth, defaultWidth));
  const [availableWidth, setAvailableWidth] = useState(maxWidth);
  const [overlayRequired, setOverlayRequired] = useState(false);
  const [resizing, setResizing] = useState(false);
  const separatorRef = useRef<HTMLDivElement>(null);
  const resizeFrom = useRef<{ x: number; width: number } | null>(null);
  const effectiveMax = Math.max(1, Math.min(maxWidth, availableWidth));
  const effectiveMin = Math.min(minWidth, effectiveMax);
  const clamp = (width: number) => Math.min(effectiveMax, Math.max(effectiveMin, width));
  const panelWidth = clamp(preferredWidth);
  const widthRef = useRef(panelWidth);
  widthRef.current = panelWidth;
  const setWidth = (width: number, persist = true) => {
    const next = clamp(width);
    widthRef.current = next;
    setPreferredWidth(next);
    if (persist) {
      try { localStorage.setItem(storageKey, String(next)); } catch { }
    }
  };
  useLayoutEffect(() => {
    const panel = separatorRef.current?.closest<HTMLElement>("aside, dialog");
    const parent = panel?.parentElement;
    const read = () => {
      const viewport = window.innerWidth;
      let available = viewport - 24;
      if (preserveChat && panel && parent && viewport >= 768) {
        const siblings = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child !== panel && child.tagName !== "MAIN");
        const occupied = siblings.reduce((sum, child) => {
          if (getComputedStyle(child).position === "absolute") return sum;
          const planned = Number.parseFloat(child.dataset.sidebarLayoutWidth ?? "");
          return sum + (Number.isFinite(planned) && planned >= 0 ? planned : child.getBoundingClientRect().width);
        }, 0);
        available = (parent.getBoundingClientRect().width || viewport) - occupied - 360;
      }
      const overlay = preserveChat && available < minWidth;
      setOverlayRequired(overlay);
      setAvailableWidth(Math.max(1, overlay ? viewport - 24 : available));
    };
    read();
    window.addEventListener("resize", read);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(read);
    if (parent) observer?.observe(parent);
    if (parent && preserveChat) for (const child of parent.children) if (child !== panel && child.tagName !== "MAIN") observer?.observe(child);
    return () => { window.removeEventListener("resize", read); observer?.disconnect(); };
  }, [preserveChat, minWidth]);
  const holder = useId();
  useEffect(() => {
    if (!resizing) return;
    holdResizeCursor(holder, true);
    const stop = () => { resizeFrom.current = null; setResizing(false); };
    window.addEventListener("pointerup", stop);
    window.addEventListener("blur", stop);
    return () => {
      holdResizeCursor(holder, false);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
    };
  }, [resizing, holder]);
  const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeFrom.current = { x: event.clientX, width: panelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  };
  const onResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeFrom.current) return;
    setWidth(resizeFrom.current.width + (resizeFrom.current.x - event.clientX) * (centered ? 2 : 1), false);
  };
  const onResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeFrom.current) return;
    resizeFrom.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setWidth(widthRef.current);
  };
  const resetWidth = () => {
    setPreferredWidth(defaultWidth);
    try { localStorage.removeItem(storageKey); } catch { }
  };
  const onSeparatorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 10 : PANEL_RESIZE_STEP;
    if (event.key === "Home") { event.preventDefault(); resetWidth(); return; }
    if (event.key === "End") { event.preventDefault(); setWidth(effectiveMax); return; }
    const delta = event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : null;
    if (delta === null) return;
    event.preventDefault();
    setWidth(panelWidth + delta);
  };
  return { minWidth: effectiveMin, maxWidth: effectiveMax, panelWidth, separatorRef, separatorWidth: panelWidth, overlayRequired, resizing, resetWidth, onSeparatorKeyDown, onResizeStart, onResizeMove, onResizeEnd };
}
