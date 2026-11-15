import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, MoreHorizontal, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Group } from "@/state/store";
import { ExportTranscriptMenu } from "./ExportTranscriptMenu";
import { GroupUsageChip } from "./GroupUsageChip";
import { RoomMoreMenu } from "./RoomMoreMenu";
import { useMenuMotion } from "./MenuMotion";
import { anchoredMenuPosition } from "./SidebarPopoverMenu";

type RoomHeaderToolsProps = {
  group: Group; setupPending: boolean; remoteClient: boolean;
  onOpenMembers: () => void; onToggleFolder: () => void;
};

export function RoomHeaderTools({ group }: RoomHeaderToolsProps) {
  return <RoomMoreMenu group={group} />;
}

export function ExpandedRoomHeaderTools({ group, setupPending, remoteClient, onOpenMembers, onToggleFolder }: RoomHeaderToolsProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const motion = useMenuMotion(open);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const close = (refocus = false) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      setPosition(anchoredMenuPosition(trigger.current.getBoundingClientRect(), panel.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, false, "end"));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => { setOpen(false); }, [group.id, group.threadId]);
  return <>
    <button ref={trigger} type="button" data-room-tools-trigger aria-label={t("botdom.header.more")} title={t("botdom.header.more")}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog"
      onClick={event => { setOpen(!open); if (!open && event.detail === 0) requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>("button")?.focus()); }}
      className="botdom-room-icon botdom-interactive"><MoreHorizontal size={19} aria-hidden="true" /></button>
    {motion.shown && createPortal(<div id={id} ref={panel} role="dialog" aria-label={t("botdom.header.more")} data-room-tools {...motion.exitProps}
      style={{ position: "fixed", left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? undefined : "hidden" }}
      className={cn("popover-surface z-50 w-[280px] max-w-[calc(100vw-16px)] rounded-2xl border border-hairline/60 bg-menu p-2 shadow-(--shadow-float)", motion.className)}>
      <button type="button" onClick={() => { close(); onOpenMembers(); }} className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-[13px] text-ink hover:bg-menu-hover"><Users size={15} />{t("room.members.manage")}</button>
      {!remoteClient && !setupPending && <button type="button" onClick={() => { close(); onToggleFolder(); }} className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-[13px] text-ink hover:bg-menu-hover"><Folder size={15} />{t("room.folder.chipTitle")}</button>}
      <div className="my-2 border-t border-hairline/50" />
      {group.usage?.turns ? <div className="flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-ink-secondary"><span>{t("botdom.header.usage")}</span><GroupUsageChip usage={group.usage} /></div> : null}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-ink-secondary"><span>{t("botdom.header.export")}</span><ExportTranscriptMenu title={group.name} messages={group.messages} isGroup /></div>
    </div>, document.body)}
  </>;
}
