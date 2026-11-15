/* Botdom's own bot faces (project-b/static/bot-3d) and their motion, drawn wherever the upstream mascot used to be.
   Motion follows Botdom's app.css/app.js: eyes follow the pointer, a squash when pressed, a hop when the state changes,
   rocking while working, a sway while waiting, and a double blink. */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { MausColor, MausState } from "@/lib/mascot";
import type { CursorAvatarHandle } from "./CursorAvatar";

const ROLES = ["captain", "lead", "research", "writer", "planner", "artist", "review", "heart", "star", "flower", "bean"] as const;

/** Upstream colour names onto the eight tones Botdom's faces come in. */
const TONE: Record<MausColor, string> = {
  green: "sage", blue: "blue", red: "pink", orange: "peach", purple: "violet", cyan: "mint",
  pink: "pink", yellow: "sand", teal: "mint", coral: "peach", silver: "supervisor", chrome: "supervisor",
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type BotdomRole = (typeof ROLES)[number];

/** The ten picker choices map onto Botdom's own figures; "cursor" keeps the face chosen from the bot's name. */
export const BODY_ROLE: Readonly<Record<string, Exclude<BotdomRole, "captain">>> = {
  blob: "bean", circle: "heart", squircle: "lead", capsule: "research", drop: "writer",
  shield: "planner", hexagon: "artist", diamond: "review", star: "star", flower: "flower",
};

export function botdomRole(seed: string, supervisor = false, chosen?: BotdomRole): BotdomRole {
  if (supervisor) return "captain";
  if (chosen) return chosen;
  const role = ROLES[hash(seed || "bot") % ROLES.length]!;
  return role === "captain" ? "review" : role;
}

/** The same bot always gets the same face: the role comes from its name, the tone from its colour. */
export function botdomFaceSrc(seed: string, color: MausColor, supervisor = false, chosen?: BotdomRole): string {
  return `/bot-3d/${botdomRole(seed, supervisor, chosen)}-${TONE[color] ?? "violet"}.png`;
}

/** Which of Botdom's state motions a mascot state gets. */
export function faceMotion(state: MausState): "work" | "wait" | "think" | "pop" | "none" {
  if (state === "working" || state === "loading" || state === "spawning") return "work";
  if (state === "thinking" || state === "waking") return "think";
  if (state === "alerting" || state === "sad" || state === "surprised") return "wait";
  if (state === "happy" || state === "celebrate" || state === "proud") return "pop";
  return "none";
}

const INK = "#6B6390";

export const avatarMotionReduced = () =>
  (typeof document !== "undefined" && document.documentElement.dataset.reducedMotion === "true") ||
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

export function pressAvatar(el: HTMLElement | null) {
  if (!el || avatarMotionReduced() || typeof el.animate !== "function") return;
  el.animate(
    [{ scale: "1", rotate: "0deg" }, { scale: ".94", rotate: "-4deg", offset: 0.2 }, { scale: "1.06", rotate: "3deg", offset: 0.5 }, { scale: "1", rotate: "0deg" }],
    { duration: 480, easing: "ease-out" },
  );
}

function react(el: HTMLElement | null) {
  if (!el || avatarMotionReduced() || typeof el.animate !== "function") return;
  el.animate(
    [{ translate: "0 0", scale: "1" }, { translate: "0 -8%", scale: "1.04 .96", offset: 0.3 }, { translate: "0 0", scale: ".97 1.03", offset: 0.6 }, { translate: "0 0", scale: "1" }],
    { duration: 600, easing: "cubic-bezier(.34,1.56,.64,1)" },
  );
}

/* One delegated pointer handler and one animation frame for the whole app, as in Botdom: the face under the
   pointer, or the face inside the row or button under it, turns its eyes toward the pointer. */
let gazeInstalled = false;
function installGaze() {
  if (gazeInstalled || typeof document === "undefined") return;
  gazeInstalled = true;
  let face: HTMLElement | null = null;
  let frame = 0;
  let point = { x: 0, y: 0 };
  const reset = () => {
    face?.style.removeProperty("--gaze-x");
    face?.style.removeProperty("--gaze-y");
    face = null;
  };
  const faceFor = (target: EventTarget | null): HTMLElement | null => {
    const el = target as Element | null;
    if (!el?.closest) return null;
    return (el.closest(".botdom-face[data-track-pointer]") as HTMLElement | null)
      ?? (el.closest("button,a,[role=button],[role=option],li,[data-bot-id]")?.querySelector(".botdom-face[data-track-pointer]") as HTMLElement | null) ?? null;
  };
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || document.hidden || avatarMotionReduced()) return;
    const next = faceFor(event.target);
    if (next !== face) { reset(); face = next; }
    if (!face) return;
    point = { x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!face?.isConnected) { reset(); return; }
      const r = face.getBoundingClientRect();
      const k = r.width / 28;
      face.style.setProperty("--gaze-x", `${Math.max(-2.5, Math.min(2.5, (point.x - r.x - r.width / 2) / 12)) * k}px`);
      face.style.setProperty("--gaze-y", `${Math.max(-1.5, Math.min(1.5, (point.y - r.y - r.height / 2) / 14)) * k}px`);
    });
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", reset);
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pressAvatar((event.target as Element | null)?.closest?.(".botdom-face[data-track-pointer]") as HTMLElement | null);
  }, { passive: true });
}

export const BotdomFace = forwardRef<CursorAvatarHandle, { seed: string; color: MausColor; size?: number; state?: MausState; label?: string; supervisor?: boolean; animated?: boolean; trackPointer?: boolean; role?: BotdomRole }>(
  function BotdomFace({ seed, color, size = 44, state = "idle", label, supervisor = false, animated = true, trackPointer = true, role: chosen }, ref) {
    const root = useRef<HTMLSpanElement>(null);
    const lastState = useRef(state);
    useEffect(installGaze, []);
    useEffect(() => {
      if (animated && lastState.current !== state) react(root.current);
      lastState.current = state;
    }, [state, animated]);
    useImperativeHandle(ref, () => ({ blink: () => react(root.current), spin: () => pressAvatar(root.current), setExpression: () => {} }), []);
    const role = botdomRole(seed, supervisor, chosen);
    const captain = role === "captain";
    const eye = { position: "absolute", top: captain ? "51%" : "42%", width: "8%", height: "15%", background: INK, borderRadius: 999 } as const;
    return (
      <span
        ref={root}
        className="botdom-face relative inline-block shrink-0"
        data-motion={animated ? faceMotion(state) : "none"}
        data-static={!animated || undefined}
        data-track-pointer={trackPointer || undefined}
        style={{ width: size, height: size }}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        <img src={botdomFaceSrc(seed, color, supervisor, chosen)} data-role={role} alt="" draggable={false} width={size} height={size} className="block size-full object-contain" />
        <span aria-hidden="true" className="botdom-features pointer-events-none absolute inset-0">
          <span className="botdom-eye" style={{ ...eye, left: "31%" }} />
          <span className="botdom-eye" style={{ ...eye, left: "61%" }} />
          <span style={{ position: "absolute", left: "40%", top: captain ? "70%" : "64%", width: "20%", height: "10%", background: INK, borderRadius: "0 0 999px 999px" }} />
        </span>
      </span>
    );
  },
);
