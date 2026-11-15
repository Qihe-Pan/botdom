import { reducedMotion } from "@/lib/onboarding";
import { BotdomCrown as Crown } from "./BotdomCrown";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { ChevronLeft, Circle, Plus } from "lucide-react";
import { useStore, type Bot, type Group, type InstanceInfo } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { EMPLOYEE_DRAG_TYPE, ROOM_MEMBER_DRAG_TYPE, memberDragPreview, roomLeadId, roomMembershipBusy, useRoomMembership } from "@/lib/room-membership";
import { roomQueuedWorkLabel, roomSpeakerIds, roomThreadQueue, roomThreadSpeakerIds } from "@/lib/room-threads";
import { BotAvatar } from "./Avatar";
import { memberActiveTodo } from "./RoomTaskBoard";
import { roomMemberModel } from "../../shared/group-models";

export function roomMemberState(group: Group, botId: string): { label: string; pose: "working" | "thinking" | "idle" | "listening" } {
  if (group.holds?.[botId]) {
    const stopping = group.queue?.some((entry) => entry.state === "running" && entry.botId === botId);
    return stopping ? { label: t("room.queue.stopping"), pose: "working" } : { label: t("botdom.members.paused"), pose: "idle" };
  }
  const pending = roomThreadQueue(group, group.threadId).find((entry) => entry.botId === botId);
  const todo = memberActiveTodo(group, botId);
  if (roomThreadSpeakerIds(group, group.threadId).includes(botId)) {
    const last = [...group.messages].reverse().find((message) => message.from?.botId === botId);
    const working = last?.kind === "activity" && last.tool?.ok === undefined;
    if (todo) return { label: t("roomTodo.memberDoing", { title: todo.title }), pose: working ? "working" : "thinking" };
    return { label: t(working ? "chat.activity.working" : "chat.activity.thinking"), pose: working ? "working" : "thinking" };
  }
  if (roomSpeakerIds(group).includes(botId)) return { label: t("botdom.members.elsewhere"), pose: "working" };
  if (pending) return { label: roomQueuedWorkLabel(group, pending, () => undefined), pose: "listening" };
  return { label: t("botdom.members.idle"), pose: "idle" };
}

export function memberHarnessGroups(members: Bot[], instances: InstanceInfo[]) {
  const groups = new Map<string, { label: string; members: Bot[] }>();
  for (const bot of members) {
    const instance = instances.find((candidate) => candidate.instanceId === bot.modelSelection.instanceId);
    const key = instance?.driverKind ?? bot.modelSelection.instanceId;
    const existing = groups.get(key);
    if (existing) existing.members.push(bot);
    else groups.set(key, { label: instance?.driverKind === "claudeAgent" ? "Claude" : instance?.driverKind === "codex" ? "Codex" : instance?.displayName ?? t("botdom.members.unknown"), members: [bot] });
  }
  return [...groups];
}

export function RoomMemberStrip({ group, members, onManage, onAdd, addButtonRef }: {
  group: Group;
  members: Bot[];
  onManage: (botId: string) => void;
  onAdd: () => void;
  addButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { state } = useStore();
  const membership = useRoomMembership();
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, DOMRect>());
  const memberKey = members.map((bot) => `${bot.id}:${bot.modelSelection.instanceId}`).join(",");
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    for (const card of root.current?.querySelectorAll<HTMLElement>("[data-room-member]") ?? []) {
      const id = card.dataset.roomMember!;
      const rect = card.getBoundingClientRect();
      next.set(id, rect);
      const before = positions.current.get(id);
      if (!before || reducedMotion() || typeof card.animate !== "function" || !rect.width) continue;
      const x = before.left - rect.left, y = before.top - rect.top;
      if (Math.abs(x) + Math.abs(y) < 1) continue;
      card.animate([{ transform: `translate(${x}px,${y}px)`, transformOrigin: "top left" }, { transform: "none", transformOrigin: "top left" }], { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" });
    }
    positions.current = next;
  }, [memberKey]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [drop, setDrop] = useState(false);
  useEffect(() => {
    const clear = () => setDrop(false);
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);
  const lead = roomLeadId(group);
  const busy = roomMembershipBusy(group);
  const harnesses = memberHarnessGroups(members.map((bot) => ({ ...bot, modelSelection: roomMemberModel(group, bot) })), state.instances);
  const visibleMembers = harnesses.reduce((total, [key, harness]) => total + (collapsed.includes(key) ? Math.min(2, harness.members.length) : harness.members.length), 0);
  return <div ref={root} data-room-member-strip className={cn("botdom-member-strip", drop && "rounded-lg bg-accent/5 ring-1 ring-inset ring-accent/30")}
    onDragOver={(event) => {
      if (!membership.allowed || !event.dataTransfer.types.includes(EMPLOYEE_DRAG_TYPE)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDrop(true);
    }}
    onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop(false); }}
    onDrop={(event) => {
      if (!membership.allowed || !event.dataTransfer.types.includes(EMPLOYEE_DRAG_TYPE)) return;
      event.preventDefault(); event.stopPropagation(); setDrop(false);
      void membership.change(group, event.dataTransfer.getData(EMPLOYEE_DRAG_TYPE), true);
    }}>
    <div className="botdom-members-track">
      {harnesses.map(([key, harness]) => {
        const folded = collapsed.includes(key);
        const count = folded ? Math.min(2, harness.members.length) : harness.members.length;
        return <section key={key} data-folded={folded || undefined} className="botdom-member-harness" style={{ "--member-count": count, "--member-share": `${count / Math.max(1, visibleMembers) * 100}%` } as CSSProperties}>
          <button type="button" aria-expanded={!folded} className="botdom-member-harness-toggle" title={harness.label}
            onClick={() => setCollapsed((current) => folded ? current.filter((id) => id !== key) : [...current, key])}>
            <span className="truncate">{harness.label}</span><span className="text-[12px] tabular-nums">{harness.members.length}</span>
            <ChevronLeft size={14} className={cn("shrink-0 transition-transform duration-150", folded && "rotate-180")} aria-hidden="true" />
          </button>
          <div className="botdom-member-harness-cards">
            {harness.members.map((bot, index) => {
              const status = roomMemberState(group, bot.id);
              const removable = membership.allowed && !busy && bot.id !== lead && members.length > 1 && !membership.saving;
              return <div key={bot.id} data-room-member={bot.id} aria-hidden={folded && index >= 2 || undefined} inert={folded && index >= 2} data-bot-color={bot.color} data-member-pose={status.pose} className="botdom-member-card bot-identity group/member"
                draggable={removable} title={bot.id === lead ? t("botdom.members.keepLead") : t("botdom.members.dragRemove")}
                onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(ROOM_MEMBER_DRAG_TYPE, JSON.stringify({ groupId: group.id, botId: bot.id })); memberDragPreview(event, bot.name); }}>
                <span data-bot-color={bot.color} data-member-pose={status.pose} className="botdom-member-face bot-identity relative flex shrink-0">
                  <BotAvatar bot={bot.id === lead ? { ...bot, supervisorGroupId: group.id } : bot} state={status.pose} size={22} animated={false} />
                  {bot.id === lead && bot.avatarUrl && bot.avatarCrop !== "mascot" && <Crown size={12} className="absolute -top-1.5 left-1" aria-label={t("botdom.members.lead")} />}
                </span>
                <button type="button" disabled={!membership.allowed} aria-label={`${t("botdom.members.settings", { name: bot.name })} · ${status.label}`} title={`${bot.name} · ${bot.modelSelection.model} · ${status.label}`}
                  onClick={() => onManage(bot.id)} className="min-w-0 flex-1 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
                  <span data-bot-color={bot.color} className="bot-identity block truncate text-[12px] font-medium leading-[14px]">{bot.id === lead ? t("botdom.members.lead") : bot.name}</span>
                  <span data-member-status className={cn("flex min-w-0 items-center gap-1 text-[10px] leading-[12px]", status.pose === "working" || status.pose === "thinking" ? "text-accent" : "text-ink-secondary")}>
                    <Circle data-member-status-dot data-bot-color={bot.color} size={4} fill="currentColor" strokeWidth={0} className="botdom-member-status-dot bot-identity" aria-hidden="true" />
                    <span className="truncate">{status.label}</span>
                  </span>
                </button>
              </div>;
            })}
          </div>
        </section>;
      })}
      {membership.allowed && <button ref={addButtonRef} type="button" disabled={busy || membership.saving} onClick={onAdd} aria-label={t("botdom.members.add")}
        title={busy ? t("botdom.members.busy") : t("botdom.members.dragAdd")} className="botdom-member-add"><Plus size={20} strokeWidth={1.5} aria-hidden="true" /></button>}
    </div>
  </div>;
}
