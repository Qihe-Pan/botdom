import { useEffect, useLayoutEffect, useRef } from "react";
import { reducedMotion } from "@/lib/onboarding";

const ACTIONS = 'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="treeitem"], [role="menuitemcheckbox"], [role="menuitemradio"], .cursor-pointer, label:has(input[type="checkbox"]), label:has(input[type="radio"])';
const ROWS = '[role="menuitem"], [role="option"], [role="treeitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [data-sidebar-thread-row], [data-sidebar-bot-row], [data-sidebar-bot-room], [data-sidebar-room-thread]';
const EASE = "cubic-bezier(.22,1,.36,1)";
const SIDEBAR_ROWS = '[data-sidebar-group-row], [data-sidebar-thread-row], [data-sidebar-bot-row], [data-sidebar-bot-room], [data-sidebar-room-thread]';
// A soft jelly wobble: squash, stretch, settle. Small enough to read as alive, not as a jump.
const JELLY: Keyframe[] = [
  { transform: "scale(1, 1)" },
  { transform: "scale(1.12, .9) translateY(1px)", offset: .2 },
  { transform: "scale(.95, 1.08) translateY(-2px)", offset: .46 },
  { transform: "scale(1.04, .97)", offset: .7 },
  { transform: "scale(.99, 1.01)", offset: .86 },
  { transform: "scale(1, 1)" },
];
const running = new WeakMap<Document, Set<Animation>>();

function play(element: Element, frames: Keyframe[], options: KeyframeAnimationOptions, id: string): Animation | null {
  if (typeof element.animate !== "function" || reducedMotion()) return null;
  const animation = element.animate(frames, options);
  animation.id = id;
  let animations = running.get(element.ownerDocument);
  if (!animations) { animations = new Set(); running.set(element.ownerDocument, animations); }
  animations.add(animation);
  void animation.finished.then(() => { if (options.fill !== "forwards") animations.delete(animation); }, () => animations.delete(animation));
  return animation;
}

export function animateConversationContents(main: Element): Animation[] {
  const content = [...main.querySelectorAll<HTMLElement>('[role="log"], [data-conversation-content]')]
    .find((element) => !element.closest('[inert], [aria-hidden="true"]'));
  if (!content || reducedMotion()) return [];
  const animation = play(content, [
    { opacity: 0, translate: "0 14px" },
    { opacity: 1, translate: "0 0" },
  ], { duration: 300, easing: EASE }, "botdom-conversation");
  return animation ? [animation] : [];
}

type Gesture = { animations: Animation[]; version: number };

export function installInteractionMotion(doc: Document): () => void {
  const gestures = new Map<HTMLElement, Gesture>();
  const presses = new Map<HTMLElement, Gesture>();
  let hovered: HTMLElement | null = null;
  const finePointer = doc.defaultView?.matchMedia("(hover: hover) and (pointer: fine)");
  const media = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)");
  const action = (target: EventTarget | null): HTMLElement | null => {
    const element = target instanceof Element ? target.closest<HTMLElement>(ACTIONS) : null;
    return element && !element.matches(':disabled, [aria-disabled="true"], label:has(input:disabled)') && !element.closest('[inert]') ? element : null;
  };
  const cancel = (gesture: Gesture) => {
    for (const animation of gesture.animations) { animation.cancel(); running.get(doc)?.delete(animation); }
  };
  const release = (element: HTMLElement, source: Map<HTMLElement, Gesture>) => {
    const gesture = source.get(element);
    if (!gesture) return;
    const version = ++gesture.version;
    for (const animation of gesture.animations) { animation.reverse(); }
    void Promise.all(gesture.animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
      if (gesture.version !== version) return;
      cancel(gesture); source.delete(element);
    });
  };
  const resume = (gesture: Gesture) => {
    gesture.version++;
    for (const animation of gesture.animations) { animation.playbackRate = 1; animation.play(); }
  };
  // The row stays where it is; only its avatars wobble once, one after another.
  const wobble = (row: HTMLElement) => {
    [...row.querySelectorAll<HTMLElement>(".botdom-face")].slice(0, 3).forEach((face, index) => {
      if (face.getAnimations().some((animation) => animation.id === "botdom-jelly")) return;
      play(face, JELLY, { duration: 460, delay: index * 45, easing: "ease-out", composite: "add" }, "botdom-jelly");
    });
  };
  const hover = (element: HTMLElement) => {
    const existing = gestures.get(element);
    if (existing) { resume(existing); return; }
    const animations: Animation[] = [];
    const safeToMove = !element.matches('a[href], label, [role="switch"], [role="checkbox"], [role="radio"], .botdom-interactive, .botdom-task-summary')
      && !element.closest('[draggable="true"], [data-resizing="true"]')
      // A control inside a row that already lights up on hover stays put, or it slides out of its own highlight.
      && !element.parentElement?.closest('[class*="hover:bg"], [role="button"], [role="option"], [role="treeitem"], [role="menuitem"], [role="tab"], summary');
    // Plain text controls (titles, inline names) only change colour; lifting them looks like a glitch.
    const shaped = element.matches(ROWS) || element.matches('[class*="bg-"], [class*="border"]');
    const sidebarRow = element.matches(SIDEBAR_ROWS);
    if (sidebarRow) {
      wobble(element);
    } else if (safeToMove && shaped) {
      const row = element.matches(ROWS);
      const animation = play(element, [{ transform: "translate(0, 0)" }, { transform: row ? "translate(3px, 0)" : "translate(0, -2px)" }],
        { duration: 240, easing: EASE, fill: "forwards", composite: "add" }, "botdom-hover");
      if (animation) animations.push(animation);
    }
    const icon = element.querySelector(':scope > svg:not([class*="animate-"], [class*="transition-"], [class*="chevron"], .botdom-disclosure-chevron)');
    if (icon) {
      const target = icon.classList.contains("lucide-settings") ? "rotate(18deg) scale(1.1)" : "translateY(-1px) scale(1.1)";
      const animation = play(icon, [{ transform: "translateY(0) scale(1)" }, { transform: target }],
        { duration: 280, easing: EASE, fill: "forwards", composite: "add" }, "botdom-icon-hover");
      if (animation) animations.push(animation);
    }
    if (animations.length) gestures.set(element, { animations, version: 0 });
  };
  const onOver = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !finePointer?.matches || reducedMotion()) return;
    const next = action(event.target);
    if (hovered === next) return;
    if (hovered) release(hovered, gestures);
    hovered = next;
    if (next) hover(next);
  };
  const onOut = (event: PointerEvent) => {
    if (hovered && (!(event.relatedTarget instanceof Node) || !hovered.contains(event.relatedTarget))) {
      release(hovered, gestures); hovered = null;
    }
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || reducedMotion()) return;
    const element = action(event.target);
    // A click on a sidebar row answers at once, before the conversation behind it has rendered.
    if (element?.matches(SIDEBAR_ROWS)) wobble(element);
    if (!element || element.matches(".botdom-task-summary") || element.closest('.botdom-member-card, [draggable="true"], [data-resizing="true"]')) return;
    const previous = presses.get(element);
    if (previous) { resume(previous); return; }
    const animation = play(element, [{ transform: "scale(1)" }, { transform: "scale(.97) translateY(1px)" }],
      { duration: 110, easing: EASE, fill: "forwards", composite: "add" }, "botdom-press");
    if (animation) presses.set(element, { animations: [animation], version: 0 });
  };
  const onUp = () => { for (const element of presses.keys()) release(element, presses); };
  const stop = () => {
    for (const animation of running.get(doc) ?? []) animation.cancel();
    running.get(doc)?.clear(); gestures.clear(); presses.clear(); hovered = null;
  };
  const onReduced = () => { if (reducedMotion()) stop(); };
  const observer = new MutationObserver(onReduced);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-reduced-motion"] });
  media?.addEventListener("change", onReduced);
  doc.addEventListener("pointerover", onOver, { passive: true });
  doc.addEventListener("pointerout", onOut, { passive: true });
  doc.addEventListener("pointerdown", onDown, { passive: true });
  doc.addEventListener("pointerup", onUp, { passive: true });
  doc.addEventListener("pointercancel", onUp, { passive: true });
  doc.defaultView?.addEventListener("blur", stop);
  return () => {
    stop(); observer.disconnect(); media?.removeEventListener("change", onReduced);
    doc.removeEventListener("pointerover", onOver); doc.removeEventListener("pointerout", onOut);
    doc.removeEventListener("pointerdown", onDown); doc.removeEventListener("pointerup", onUp); doc.removeEventListener("pointercancel", onUp);
    doc.defaultView?.removeEventListener("blur", stop);
  };
}

export function useInterfaceMotion(conversation: string | null, ready = true): void {
  const played = useRef<string | null>(null);
  useEffect(() => installInteractionMotion(document), []);
  useLayoutEffect(() => {
    if (conversation === null) { played.current = null; return; }
    if (!ready || played.current === conversation) return;
    let animations: Animation[] = [];
    const observer = new MutationObserver(() => reveal());
    const reveal = () => {
      const main = document.querySelector("main");
      if (!main?.querySelector('[role="log"]:not([inert]), [data-conversation-content]')) return false;
      animations = animateConversationContents(main);
      played.current = conversation;
      observer.disconnect();
      return true;
    };
    if (!reveal()) observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); for (const animation of animations) animation.cancel(); };
  }, [conversation, ready]);
}
