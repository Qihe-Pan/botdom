import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Group } from "@/state/store";
import { t } from "@/lib/i18n";
import { mergeSectionOrder, moveSection, orderedSidebarSections, placeSection, sidebarLayoutInteractive } from "@/lib/sidebar-layout";
import { stepKey } from "@/lib/sidebar-bot-drop";
import { loadSidebarRoomOrder, saveSidebarRoomOrder, type SidebarDensity } from "@/lib/sidebar-preferences";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { useSidebarSections } from "./SidebarSections";
import { sidebarSectionAttention } from "@/lib/sidebar-attention";
import { SidebarFold } from "./SidebarFold";
import { useReorderGlide } from "@/hooks/use-pointer-reorder";

const ROOM_DRAG_TYPE = "application/x-botdom-sidebar-room";
const ROOMS_SECTION_ID = "botdom:rooms";

export type RoomRowOrder = {
  dragging: boolean;
  drop: "before" | "after" | null;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  drag: {
    draggable: boolean;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
};

export function orderedSidebarRooms<T extends Pick<Group, "id">>(rooms: T[], saved: string[]): T[] {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  return orderedSidebarSections(rooms.map((room) => room.id), saved).map((id) => byId.get(id)!);
}

export function SidebarRoomList({ groups, density, query, renderRow }: {
  groups: Group[];
  density: SidebarDensity;
  query: string;
  renderRow: (group: Group, order: RoomRowOrder | undefined) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(loadSidebarRoomOrder);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const source = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const label = () => t("botdom.sidebar.groups");
  const sections = useSidebarSections({ simple: true, rail: density === "icons", density, query, label, sidebarRef: root, rooms: true });
  const ordered = orderedSidebarRooms(groups.filter((group) => !group.dm), saved);
  const interactive = sidebarLayoutInteractive(density, query);
  // While a room is dragged the list already shows where it would land, so the other rows slide out of the way.
  const previewIds = dragging && drop && drop.id !== dragging ? placeSection(ordered.map((room) => room.id), dragging, drop.id, drop.place) : null;
  const shown = previewIds ? previewIds.map((id) => ordered.find((room) => room.id === id)!) : ordered;
  useReorderGlide(root, "data-sidebar-group-row");
  const reset = () => { source.current = null; setDragging(null); setDrop(null); };
  const save = (group: Group, ids: string[], keyboard = false) => {
    const next = mergeSectionOrder(saved, ids);
    setSaved(next);
    saveSidebarRoomOrder(next);
    setAnnouncement(t("sidebar.section.moved", { name: group.name, position: ids.indexOf(group.id) + 1, count: ids.length }));
    if (keyboard) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-sidebar-group-row="${CSS.escape(group.id)}"]`)?.focus());
  };
  const rowOrder = (group: Group, list: Group[]): RoomRowOrder | undefined => !interactive ? undefined : {
    dragging: dragging === group.id,
    drop: null,
    onKeyDown: (event) => {
      const direction = stepKey(event);
      if (!direction) return;
      event.preventDefault();
      const ids = list.map((room) => room.id);
      const next = moveSection(ids, group.id, direction);
      if (next !== ids) save(group, next, true);
    },
    drag: {
      draggable: true,
      onDragStart: (event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(ROOM_DRAG_TYPE, group.id);
        source.current = group.id;
        setDragging(group.id);
      },
      onDragEnd: reset,
      onDragOver: (event) => {
        if (!event.dataTransfer.types.includes(ROOM_DRAG_TYPE) || !list.some((room) => room.id === source.current)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        // Over its own placeholder the room keeps the place it was last given; otherwise the rows would flip back and forth.
        if (group.id === source.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const place = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        setDrop((current) => current?.id === group.id && current.place === place ? current : { id: group.id, place });
      },
      onDrop: (event) => {
        if (!event.dataTransfer.types.includes(ROOM_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        const moving = list.find((room) => room.id === source.current);
        const rect = event.currentTarget.getBoundingClientRect();
        const target = moving && moving.id === group.id ? drop : { id: group.id, place: event.clientY < rect.top + rect.height / 2 ? "before" as const : "after" as const };
        if (moving && target && target.id !== moving.id) save(moving, placeSection(list.map((room) => room.id), moving.id, target.id, target.place));
        reset();
      },
    },
  };

  if (!ordered.length) return null;
  const collapsed = sections.collapsed(ROOMS_SECTION_ID);
  return <div ref={root} data-sidebar-rooms className={"flex flex-col gap-0.5"}>
    <span className="sr-only" aria-live="polite">{announcement || sections.announcement}</span>
    {density !== "icons" && <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1"><SidebarSectionHeader name={t("botdom.sidebar.groups")} count={ordered.length} line leadingChevron collapsed={collapsed}
        onToggle={interactive ? () => sections.toggle(ROOMS_SECTION_ID) : undefined} attention={sidebarSectionAttention([], ordered)} reorderable={false} dragging={false} /></div>

    </div>}
    <SidebarFold open={!collapsed}>{shown.map((group) => renderRow(group, rowOrder(group, ordered)))}</SidebarFold>
  </div>;
}
