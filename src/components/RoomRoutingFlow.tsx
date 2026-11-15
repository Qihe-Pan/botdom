import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { t } from "@/lib/i18n";
import { advanceRoomRouting, ROOM_ROUTING_BATCH_MS, roomRoutingSnapshot, type RoomRoutingItem } from "@/lib/room-routing";
import type { Bot, Group } from "@/state/store";
import { BotdomCrown } from "./BotdomCrown";
import { BotAvatar } from "./Avatar";
import { useLiveMotion } from "./cloud-buy/live-motion";
import "./room-routing.css";

function FlowWire({ moving, returning = false }: { moving: boolean; returning?: boolean }) {
  return <svg className="room-routing-wire" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" data-flow-moving={moving || undefined} data-flow-returning={returning || undefined}>
    <path className="room-routing-line" d="M 0 18 C 30 18 36 6 64 6 S 85 12 100 12" vectorEffect="non-scaling-stroke" />
    {moving && <path key={returning ? "return" : "outbound"} className="room-routing-dot" d="M 0 18 C 30 18 36 6 64 6 S 85 12 100 12" pathLength="100" vectorEffect="non-scaling-stroke" />}
  </svg>;
}

const RoutingRow = memo(function RoutingRow({ item, bot, motion, status, fallbackName, fallbackTitle, onSelect }: {
  item: RoomRoutingItem; bot?: Bot; motion: boolean; status: string; fallbackName: string; fallbackTitle: string; onSelect: (item: RoomRoutingItem) => void;
}) {
  const name = bot?.name ?? fallbackName;
  const title = item.title ?? fallbackTitle;
  const label = `${name} · ${title} · ${status}${item.reason ? ` · ${item.reason}` : ""}`;
  const moving = motion && Boolean(item.executionId || item.assignmentId) && (item.phase === "running" || item.phase === "returning");
  return <li className="room-routing-row" data-routing-key={item.key} data-routing-phase={item.phase} data-execution-id={item.executionId} data-assignment-id={item.assignmentId} data-todo-id={item.todoId}>
    <FlowWire moving={moving} returning={item.phase === "returning"} />
    <button type="button" className="room-routing-member" title={label} aria-label={label} onClick={() => onSelect(item)}>
      {bot ? <BotAvatar bot={bot} size={19} animated={false} /> : <UserRound size={16} aria-hidden="true" />}
      <span className="room-routing-member-text"><span>{name}</span><span>{title}</span></span>
      <span className="room-routing-status">{status}</span>
    </button>
  </li>;
});

export function RoomRoutingFlow({ group, members, onOpenBoard, onReport }: { group: Group; members: Bot[]; onOpenBoard: () => void; onReport: (messageId: string) => void }) {
  const surface = useRef<HTMLElement>(null);
  const motion = useLiveMotion(surface);
  const serialized = JSON.stringify(roomRoutingSnapshot(group));
  const snapshot = useMemo(() => JSON.parse(serialized) as ReturnType<typeof roomRoutingSnapshot>, [serialized]);
  const latest = useRef(snapshot);
  const applied = useRef(snapshot);
  latest.current = snapshot;
  const [model, setModel] = useState(() => advanceRoomRouting(undefined, snapshot, Date.now(), false));
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [selected, setSelected] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setSelection = useCallback((item: RoomRoutingItem) => setSelected((before) => before === item.key ? undefined : item.key), []);
  useEffect(() => {
    const cancel = () => { clearTimeout(timer.current); timer.current = undefined; };
    const visibility = () => {
      cancel();
      setHidden(document.hidden);
      if (!document.hidden) {
        applied.current = latest.current;
        setModel((before) => advanceRoomRouting(before, latest.current, Date.now(), false));
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancel(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (document.hidden || timer.current !== undefined || snapshot === applied.current) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      applied.current = latest.current;
      setModel((before) => advanceRoomRouting(before, latest.current, Date.now()));
    }, ROOM_ROUTING_BATCH_MS);
  }, [snapshot]);
  useEffect(() => {
    const expiry = Math.min(...model.items.flatMap((item) => item.returnUntil ? [item.returnUntil] : []));
    if (hidden || !Number.isFinite(expiry)) return;
    const timeout = setTimeout(() => setModel((before) => advanceRoomRouting(before, latest.current, Date.now())), Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timeout);
  }, [model, hidden]);
  const current = model.scope === snapshot.scope ? model : advanceRoomRouting(undefined, snapshot, Date.now(), false);
  const chosen = current.items.find((item) => item.key === selected);
  const supervisor = members.find((bot) => bot.id === group.supervisorId);
  if (!current.items.length && !current.supervisorRunning) return null;
  return <section ref={surface} className="room-routing" aria-label={t("roomRouting.title")} data-room-routing data-paused={hidden || undefined}>
    <div className="room-routing-source"><UserRound size={15} aria-hidden="true" /><span>{t("roomTodo.by.user")}</span><FlowWire moving={motion && !hidden && current.supervisorRunning} /></div>
    <div className="room-routing-supervisor" title={supervisor?.name ?? t("botdom.members.lead")}><BotdomCrown size={19} aria-hidden="true" /><span>{t("botdom.members.lead")}</span></div>
    <ul className="room-routing-routes">{current.items.map((item) => <RoutingRow key={item.key} item={item} bot={members.find((bot) => bot.id === item.botId)} motion={motion && !hidden}
      status={t(`roomRouting.${item.phase}`)} fallbackName={t("sidebar.preview.aBot")} fallbackTitle={t("roomRouting.unknownTask")} onSelect={setSelection} />)}</ul>
    {current.overflow > 0 && <button type="button" className="room-routing-overflow" onClick={onOpenBoard}>{t("roomRouting.more", { count: current.overflow })}</button>}
    {chosen && <div className="room-routing-detail" role="status">
      <p>{members.find((bot) => bot.id === chosen.botId)?.name ?? t("sidebar.preview.aBot")} · {chosen.title ?? t("roomRouting.unknownTask")} · {t(`roomRouting.${chosen.phase}`)}</p>
      {chosen.reason && <p>{chosen.reason}</p>}
      <button type="button" onClick={() => chosen.reportMessageId ? onReport(chosen.reportMessageId) : onOpenBoard()}>{t(chosen.reportMessageId ? "roomTodo.jump" : "roomTodo.open")}</button>
    </div>}
  </section>;
}
