import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { navigateThreadMenu } from "./BotProjects";
import { useMenuMotion } from "./MenuMotion";
import { MENU_SHEET } from "./menu-recipe";
import { anchoredMenuPosition } from "./SidebarPopoverMenu";

export function SidebarCreateMenu({ open, trigger, label, onClose, children }: {
  open: boolean; trigger: RefObject<HTMLButtonElement | null>; label: string;
  onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const motion = useMenuMotion(open);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      setPosition(anchoredMenuPosition(trigger.current.getBoundingClientRect(), panel.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, false, "end"));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, trigger]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      event.preventDefault(); onClose(); trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [open, onClose, trigger]);
  return motion.shown && createPortal(<div id={id} ref={panel} role="menu" aria-label={label} data-sidebar-create-menu
    onKeyDown={navigateThreadMenu} {...motion.exitProps}
    style={{ position: "fixed", left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? undefined : "hidden", maxHeight: "calc(100dvh - 16px)" }}
    className={cn("z-50 w-max min-w-[200px] max-w-[calc(100vw-16px)] overflow-y-auto", MENU_SHEET, motion.className)}>{children}</div>, document.body);
}
