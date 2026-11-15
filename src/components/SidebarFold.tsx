import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** How long a fold takes for this much content: a short list and a long one should look like the same motion,
 * not the long one snapping shut because it covers ten times the distance in the same time. */
export function foldDurationMs(height: number): number {
  return Math.round(Math.min(480, 200 + Math.sqrt(Math.max(0, height)) * 6));
}

export function SidebarFold({ open, children }: { open: boolean; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const fold = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const height = content.current?.scrollHeight ?? 0;
    fold.current?.style.setProperty("--fold-ms", `${foldDurationMs(height)}ms`);
  }, [open]);
  return <div ref={fold} className={cn("botdom-sidebar-fold", !open && "is-closed")} style={{ "--fold-ms": "320ms" } as CSSProperties}
    aria-hidden={!open || undefined} inert={!open}>
    <div ref={content} className="botdom-sidebar-fold-content">{children}</div>
  </div>;
}
