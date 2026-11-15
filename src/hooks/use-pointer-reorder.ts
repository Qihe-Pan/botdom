import { useEffect, useLayoutEffect, useRef } from "react";
import { reducedMotion } from "@/lib/onboarding";

export const REORDER_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const GLIDE_MS = 240;
const SETTLE_MS = 200;
const LIFT_PX = 6;
const EDGE_PX = 24;

export interface ReorderMove { key: string; targetKey: string; position: "before" | "after" }
type Box = { top: number; height: number };

/** The place the dragged item takes among the others: how many of them have their middle above its middle. */
export function reorderIndex(boxes: readonly Box[], source: number, center: number): number {
  let index = 0;
  boxes.forEach((box, at) => { if (at !== source && center > box.top + box.height / 2) index += 1; });
  return index;
}

/** How far each original slot slides while the dragged item hovers at `index` (an index among the others). */
export function reorderShifts(boxes: readonly Box[], source: number, index: number): number[] {
  const own = boxes[source]!;
  const next = boxes[source + 1] ?? boxes[source - 1];
  const gap = next ? Math.max(0, next.top > own.top ? next.top - own.top - own.height : own.top - next.top - next.height) : 0;
  const slot = own.height + gap;
  return boxes.map((_, at) => {
    if (at === source) return 0;
    if (index > source - 1 && at > source && at <= index) return -slot;
    if (index < source && at >= index && at < source) return slot;
    return 0;
  });
}

export function reorderMove(keys: readonly string[], source: number, index: number): ReorderMove | null {
  const others = keys.filter((_, at) => at !== source);
  if (index === source || !others.length) return null;
  return index < others.length
    ? { key: keys[source]!, targetKey: others[index]!, position: "before" }
    : { key: keys[source]!, targetKey: others.at(-1)!, position: "after" };
}

/**
 * Pointer sorting with the lift, glide and settle of the original web app: a lifted copy follows the pointer, its peers
 * slide aside while it moves, and on release the copy settles into its slot before the new order is committed.
 * Items carry `data-reorder-key`; dragging starts from an element with `data-reorder-handle` inside one.
 */
export function usePointerReorder({ container, peers, onMove, enabled = true }: {
  container: React.RefObject<HTMLElement | null>;
  /** The keys that may trade places with `key`, in their shown order, or null when `key` cannot move. */
  peers: (key: string) => readonly string[] | null;
  onMove: (move: ReorderMove) => void;
  enabled?: boolean;
}) {
  const latest = useRef({ peers, onMove, enabled });
  latest.current = { peers, onMove, enabled };
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    type Drag = {
      id: number; key: string; keys: string[]; items: HTMLElement[]; boxes: Box[]; source: number;
      startX: number; startY: number; x: number; y: number; offsetX: number; offsetY: number; left: number; width: number;
      scroller: HTMLElement | null; scrollStart: number; index: number; ghost?: HTMLElement; frame: number; active: boolean;
    };
    let drag: Drag | null = null;
    let suppressClick = false;
    const still = () => reducedMotion();
    const scrolled = (p: Drag) => (p.scroller ? p.scroller.scrollTop - p.scrollStart : 0);
    const place = (p: Drag) => {
      const shifts = reorderShifts(p.boxes, p.source, p.index);
      shifts[p.source] = landingOffset(p.boxes, p.source, p.index);
      p.items.forEach((item, at) => {
        item.style.transition = still() ? "" : `transform ${GLIDE_MS}ms ${REORDER_EASE}`;
        item.style.transform = shifts[at] ? `translateY(${shifts[at]}px)` : "";
      });
    };
    const clear = (p: Drag) => {
      for (const item of p.items) { item.style.transition = ""; item.style.transform = ""; item.removeAttribute("data-reorder-lifted"); }
    };
    const tick = () => {
      const p = drag;
      if (!p?.active || !p.ghost) return;
      p.ghost.style.transform = `translate3d(${p.left}px,${p.y - p.offsetY}px,0) scale(1.02)`;
      if (p.scroller) {
        const bounds = p.scroller.getBoundingClientRect();
        if (p.y < bounds.top + EDGE_PX) p.scroller.scrollTop -= 6;
        else if (p.y > bounds.bottom - EDGE_PX) p.scroller.scrollTop += 6;
      }
      const own = p.boxes[p.source]!;
      const index = reorderIndex(p.boxes, p.source, p.y - p.offsetY + own.height / 2 + scrolled(p));
      if (index !== p.index) { p.index = index; place(p); }
      p.frame = requestAnimationFrame(tick);
    };
    const finish = (save: boolean) => {
      const p = drag;
      drag = null;
      if (!p) return;
      cancelAnimationFrame(p.frame);
      if (host.hasPointerCapture?.(p.id)) host.releasePointerCapture(p.id);
      if (!p.active) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (save) p.index = reorderIndex(p.boxes, p.source, p.y - p.offsetY + p.boxes[p.source]!.height / 2 + scrolled(p));
      const move = save ? reorderMove(p.keys, p.source, p.index) : null;
      if (!move) { p.index = p.source; place(p); }
      const landing = p.boxes[p.source]!.top + (move ? landingOffset(p.boxes, p.source, p.index) : 0) - scrolled(p);
      const done = () => {
        p.ghost?.remove();
        clear(p);
        if (move) latest.current.onMove(move);
      };
      if (!p.ghost || still()) { done(); return; }
      const settle = p.ghost.animate([
        { transform: p.ghost.style.transform, opacity: 1 },
        { transform: `translate3d(${p.left}px,${landing}px,0) scale(1)`, opacity: 1 },
      ], { duration: SETTLE_MS, easing: REORDER_EASE, fill: "forwards" });
      settle.finished.catch(() => {}).finally(done);
    };
    const onDown = (event: PointerEvent) => {
      if (!latest.current.enabled || event.button !== 0 || drag) return;
      const handle = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-reorder-handle]");
      const item = handle?.closest<HTMLElement>("[data-reorder-key]");
      if (!handle || !item || !host.contains(item)) return;
      const key = item.dataset.reorderKey!;
      const keys = latest.current.peers(key);
      if (!keys || keys.length < 2 || !keys.includes(key)) return;
      const items = keys.map((peer) => host.querySelector<HTMLElement>(`[data-reorder-key="${CSS.escape(peer)}"]`)).filter((node): node is HTMLElement => Boolean(node));
      if (items.length !== keys.length) return;
      const rects = items.map((node) => node.getBoundingClientRect());
      const source = keys.indexOf(key);
      const scroller = item.closest<HTMLElement>(".overflow-y-auto");
      drag = {
        id: event.pointerId, key, keys: [...keys], items, boxes: rects.map((rect) => ({ top: rect.top, height: rect.height })), source,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
        offsetX: event.clientX - rects[source]!.left, offsetY: event.clientY - rects[source]!.top, left: rects[source]!.left, width: rects[source]!.width,
        scroller, scrollStart: scroller?.scrollTop ?? 0, index: source, frame: 0, active: false,
      };
    };
    const onMovePointer = (event: PointerEvent) => {
      const p = drag;
      if (!p || p.id !== event.pointerId) return;
      p.x = event.clientX; p.y = event.clientY;
      if (!p.active && Math.hypot(p.x - p.startX, p.y - p.startY) < LIFT_PX) return;
      event.preventDefault();
      if (p.active) return;
      p.active = true;
      const source = p.items[p.source]!;
      const ghost = source.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-reorder-key");
      ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      ghost.inert = true;
      ghost.setAttribute("aria-hidden", "true");
      ghost.classList.add("botdom-reorder-ghost");
      Object.assign(ghost.style, { width: `${p.width}px`, transform: `translate3d(${p.left}px,${p.boxes[p.source]!.top}px,0)` });
      document.body.append(ghost);
      p.ghost = ghost;
      source.setAttribute("data-reorder-lifted", "");
      host.setPointerCapture?.(p.id);
      p.frame = requestAnimationFrame(tick);
    };
    const onUp = (event: PointerEvent) => { if (drag?.id === event.pointerId) finish(true); };
    const onCancel = (event: PointerEvent) => { if (drag?.id === event.pointerId) finish(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && drag?.active) { event.preventDefault(); event.stopPropagation(); finish(false); } };
    const onClick = (event: MouseEvent) => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMovePointer);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onCancel);
    host.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      finish(false);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMovePointer);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onCancel);
      host.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [container]);
}

/** Where the dragged item's top lands, relative to where it started, once the others have slid aside. */
export function landingOffset(boxes: readonly Box[], source: number, index: number): number {
  const own = boxes[source]!;
  if (index > source) return boxes[index]!.top + boxes[index]!.height - own.height - own.top;
  if (index < source) return boxes[index]!.top - own.top;
  return 0;
}

/**
 * Slides items from where they were to where they now are, but only when the same items changed order, so expanding,
 * collapsing or adding content never sets the list moving. `skip` is set by a pointer drop whose items already slid into place.
 */
export function useReorderGlide(container: React.RefObject<HTMLElement | null>, attribute: string, skip?: React.RefObject<boolean>) {
  const last = useRef(new Map<string, number>());
  const sequence = useRef("");
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const origin = root.getBoundingClientRect().top - root.scrollTop;
    const all = [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)];
    const seen = new Map<string, number>();
    for (const item of all) seen.set(item.getAttribute(attribute)!, (seen.get(item.getAttribute(attribute)!) ?? 0) + 1);
    const items = all.filter((item) => seen.get(item.getAttribute(attribute)!) === 1);
    const next = new Map<string, number>();
    for (const item of items) {
      for (const running of item.getAnimations?.() ?? []) if (running.id === "reorder-glide") running.cancel();
      next.set(item.getAttribute(attribute)!, item.getBoundingClientRect().top - origin);
    }
    const previous = last.current;
    last.current = next;
    const order = [...next.keys()].join("|");
    const sameItems = [...next.keys()].sort().join("|") === sequence.current.split("|").sort().join("|");
    const reordered = sequence.current !== "" && sequence.current !== order && sameItems;
    sequence.current = order;
    const skipped = skip?.current ?? false;
    if (skip) skip.current = false;
    if (!reordered || skipped || !previous.size || reducedMotion()) return;
    for (const item of items) {
      const before = previous.get(item.getAttribute(attribute)!);
      const delta = before === undefined ? 0 : before - next.get(item.getAttribute(attribute)!)!;
      if (Math.abs(delta) < 1 || typeof item.animate !== "function") continue;
      const glide = item.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: GLIDE_MS, easing: REORDER_EASE });
      glide.id = "reorder-glide";
    }
  });
}
