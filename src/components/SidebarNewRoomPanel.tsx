import { isRoomSupervisor } from "../../shared/room-supervisor";
import { useState } from "react";
import { Minus, Plus, Users, Zap } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { useStore, type InstanceInfo } from "@/state/store";
import { createGroupWithEmployees } from "@/state/bot-rooms";
import { t } from "@/lib/i18n";
import { BotPickerList } from "./BotPickerList";

const MAX_EMPLOYEES = 20;
const MAX_PER_ENGINE = 6;

function usableEngines(instances: readonly InstanceInfo[]): InstanceInfo[] {
  return instances.filter((instance) => instance.snapshot.state === "available" && !instance.readOnly && instance.models.default);
}

export function NewRoomPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const engines = usableEngines(state.instances);
  const [mode, setMode] = useState<"quick" | "pick">(engines.length ? "quick" : "pick");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [lead, setLead] = useState(engines[0]?.instanceId ?? "");
  const [counts, setCounts] = useState<Record<string, number>>(() => (engines[0] ? { [engines[0].instanceId]: 2 } : {}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bots = state.bots.filter((b) => !b.hidden && !isRoomSupervisor(b, state.groups));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const bump = (id: string, delta: number) => setCounts((prev) => {
    if (delta > 0 && total >= MAX_EMPLOYEES) return prev;
    return { ...prev, [id]: Math.max(0, Math.min(MAX_PER_ENGINE, (prev[id] ?? 0) + delta)) };
  });

  const createPicked = () => {
    if (!picked.size) return;
    dispatch({ type: "createGroup", memberIds: [...picked], name: name.trim() || undefined });
    track("room_created", { members: picked.size, context: false });
    onClose();
  };
  const createQuick = async () => {
    const supervisor = engines.find((engine) => engine.instanceId === lead);
    if (!supervisor || !total || busy) return;
    setBusy(true); setError("");
    try {
      const { group } = await createGroupWithEmployees({
        name: name.trim() || t("sidebar.newChannel.quickDefaultName"),
        supervisor: { instanceId: supervisor.instanceId, model: supervisor.models.default },
        employees: engines.filter((engine) => (counts[engine.instanceId] ?? 0) > 0)
          .map((engine) => ({ instanceId: engine.instanceId, model: engine.models.default, count: counts[engine.instanceId]! })),
      });
      dispatch({ type: "groupPatched", group: { ...group, description: group.description ?? undefined } });
      dispatch({ type: "select", id: group.id });
      track("room_created", { members: total + 1, context: false });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };
  const create = () => (mode === "quick" ? void createQuick() : createPicked());

  return (
    <div className="botdom-members-scrim fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("sidebar.newChannel.title")}
        className="botdom-members-dialog flex max-h-[calc(100dvh-32px)] w-[440px] max-w-full flex-col overflow-hidden rounded-[20px] border border-hairline/40 bg-card shadow-2xl"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="px-5 pt-4">
          <h2 className="text-[16px] font-semibold text-ink">{t("sidebar.newChannel.title")}</h2>
          <input autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            aria-label={t("sidebar.newChannel.nameLabel")} placeholder={t("sidebar.newChannel.name")}
            className="mt-3 w-full rounded-xl border border-hairline/50 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-tertiary focus:border-ink/40 focus:outline-none" />
          <div role="tablist" aria-label={t("sidebar.newChannel.title")} className="mt-3 inline-flex h-8 items-center gap-0.5 rounded-lg bg-raised/70 p-0.5">
            {(["quick", "pick"] as const).map((option) => <button key={option} type="button" role="tab" aria-selected={mode === option}
              disabled={option === "quick" && !engines.length} onClick={() => setMode(option)}
              className={cn("flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px] transition-colors motion-reduce:transition-none disabled:opacity-40",
                mode === option ? "bg-card font-medium text-ink shadow-sm" : "text-ink-secondary hover:text-ink")}>
              {option === "quick" ? <Zap size={13} /> : <Users size={13} />}{t(option === "quick" ? "sidebar.newChannel.quick" : "sidebar.newChannel.pick")}
            </button>)}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {mode === "quick" ? <div className="flex flex-col gap-4">
            <section>
              <p className="mb-1.5 text-[12px] text-ink-secondary">{t("sidebar.newChannel.leadEngine")}</p>
              <div className="flex flex-wrap gap-1.5">
                {engines.map((engine) => <button key={engine.instanceId} type="button" aria-pressed={lead === engine.instanceId} onClick={() => setLead(engine.instanceId)}
                  className={cn("botdom-press rounded-full border px-3 py-1.5 text-[12.5px] transition-colors motion-reduce:transition-none",
                    lead === engine.instanceId ? "border-ink bg-ink text-card shadow-sm" : "border-hairline/60 bg-card text-ink-secondary hover:border-ink/30 hover:text-ink")}>
                  {engine.displayName}
                </button>)}
              </div>
            </section>
            <section>
              <p className="mb-1.5 text-[12px] text-ink-secondary">{t("sidebar.newChannel.employees")}</p>
              <ul className="flex flex-col gap-1">
                {engines.map((engine) => {
                  const count = counts[engine.instanceId] ?? 0;
                  return <li key={engine.instanceId} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 transition-colors", count ? "bg-card shadow-sm ring-1 ring-ink/10" : "bg-raised/40")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{engine.displayName}</span>
                      <span className="block truncate text-[11.5px] text-ink-tertiary">{engine.models.options.find((option) => option.id === engine.models.default)?.label ?? engine.models.default}</span>
                    </span>
                    <button type="button" onClick={() => bump(engine.instanceId, -1)} disabled={!count} aria-label={t("sidebar.newChannel.fewer", { name: engine.displayName })}
                      className="botdom-press flex size-7 items-center justify-center rounded-full border border-hairline/70 bg-card text-ink-secondary hover:text-ink disabled:opacity-30"><Minus size={13} /></button>
                    <span className="w-5 text-center text-[14px] font-medium tabular-nums text-ink" aria-live="polite">{count}</span>
                    <button type="button" onClick={() => bump(engine.instanceId, 1)} disabled={count >= MAX_PER_ENGINE || total >= MAX_EMPLOYEES} aria-label={t("sidebar.newChannel.more", { name: engine.displayName })}
                      className="botdom-press flex size-7 items-center justify-center rounded-full bg-ink text-card shadow-sm hover:opacity-85 disabled:opacity-25"><Plus size={13} /></button>
                  </li>;
                })}
              </ul>
              <p className="mt-2 text-[11.5px] text-ink-tertiary">{t("sidebar.newChannel.quickHint")}</p>
            </section>
          </div> : <BotPickerList bots={bots} picked={picked} onToggle={toggle} emptyHint={t("sidebar.newChannel.emptyHint")} />}
          {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}
        </div>

        <footer className="flex items-center gap-2 border-t border-hairline/40 px-5 py-3">
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-tertiary">
            {mode === "quick" ? t("sidebar.newChannel.quickSummary", { count: total }) : ""}
          </span>
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-[13.5px] text-ink-secondary hover:bg-raised hover:text-ink">{t("common.cancel")}</button>
          <button type="button" onClick={create} disabled={mode === "quick" ? !total || busy || !lead : !picked.size}
            className="botdom-press rounded-xl bg-ink px-4 py-2 text-[13.5px] font-medium text-card hover:opacity-85 disabled:opacity-30">
            {mode === "quick" ? t(busy ? "sidebar.newChannel.creating" : "sidebar.newChannel.quickCreate")
              : picked.size <= 1 ? t(picked.size ? "sidebar.newChannel.createOne" : "sidebar.newChannel.create") : t("sidebar.newChannel.createMany", { count: picked.size })}
          </button>
        </footer>
      </div>
    </div>
  );
}
