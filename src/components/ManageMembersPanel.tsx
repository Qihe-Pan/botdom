import { isRoomSupervisor } from "../../shared/room-supervisor";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Pause, Play, Plus, UserMinus, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { api, useStore, type Bot, type Group } from "@/state/store";
import { nextMemberIds } from "@/lib/room-members";
import { t } from "@/lib/i18n";
import { roomLeadId, roomMembershipBusy, useRoomMembership } from "@/lib/room-membership";
import { BotAvatar } from "./Avatar";
import { BotdomCrown } from "./BotdomCrown";
import { ModelPicker } from "./ModelPicker";
import { roomMemberModel } from "../../shared/group-models";
import type { ModelSelection } from "../../shared/wire";

const EXIT_MS = 160;

export function ManageMembersPanel({
  group,
  onClose,
  triggerRef,
  initialBotId = null,
}: {
  group: Group;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  initialBotId?: string | null;
}) {
  const { state, dispatch } = useStore();
  const membership = useRoomMembership();
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(group.memberIds));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const openedMemberIds = useRef([...group.memberIds]);
  const pendingModels = useRef(new Set<string>());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const lead = roomLeadId(group);
  const busy = roomMembershipBusy(group);
  const locked = !membership.allowed || busy;

  const saveMemberModel = async (bot: Bot, selection: ModelSelection) => {
    if (!membership.allowed || busy || !group.memberIds.includes(bot.id) || pendingModels.current.has(bot.id)) return;
    pendingModels.current.add(bot.id);
    try {
      await api(`/api/groups/${encodeURIComponent(group.id)}/member-models`, {
        method: "PATCH",
        body: JSON.stringify({ changes: [{ botId: bot.id, model: selection.model, ...(selection.effort !== undefined ? { effort: selection.effort } : {}), ...(selection.variant !== undefined ? { variant: selection.variant } : {}) }] }),
      });
    } catch (error) {
      dispatch({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      pendingModels.current.delete(bot.id);
    }
  };

  // Archived bots stay listed while still members, or a room could keep a member you cannot remove.
  const bots = useMemo(
    () => state.bots.filter((b) => (!isRoomSupervisor(b, state.groups) || b.id === lead) && (!b.hidden || group.memberIds.includes(b.id))),
    [state.bots, state.groups, lead, group.memberIds],
  );
  const memberIds = nextMemberIds(group.memberIds, picked, bots.map((b) => b.id));
  const members = memberIds.map((id) => bots.find((bot) => bot.id === id)).filter((bot): bot is Bot => Boolean(bot));
  const others = bots.filter((bot) => !picked.has(bot.id) && bot.id !== lead);
  const changed = memberIds.length !== group.memberIds.length || memberIds.some((id, i) => id !== group.memberIds[i]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  };
  closeRef.current = close;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () =>
      [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (element) => !element.hasAttribute("hidden"),
      );
    (dialog.querySelector<HTMLElement>(`[data-member-row="${initialBotId}"] button`) ?? focusable()[0])?.focus();
    if (initialBotId) dialog.querySelector(`[data-member-row="${initialBotId}"]`)?.scrollIntoView?.({ block: "nearest" });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return event.preventDefault();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [triggerRef, initialBotId]);

  const setMember = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const save = async () => {
    if (!membership.allowed || busy || saving || !memberIds.length) return;
    const opened = openedMemberIds.current;
    if (opened.length !== group.memberIds.length || opened.some((id, index) => id !== group.memberIds[index])) {
      setSaveError(t("botdom.members.changed"));
      return;
    }
    if (lead && !memberIds.includes(lead)) { setSaveError(t("botdom.members.keepLead")); return; }
    try {
      setSaving(true);
      if (changed) {
        const response = await api<{ group: Group }>(`/api/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ memberIds }) });
        dispatch({ type: "groupPatched", group: response.group });
        track("room_members_changed", {
          members: memberIds.length,
          added: memberIds.filter((id) => !group.memberIds.includes(id)).length,
          removed: group.memberIds.filter((id) => !memberIds.includes(id)).length,
        });
      }
      close();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };

  const engineName = (bot: Bot) => state.instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId)?.displayName ?? bot.modelSelection.instanceId;

  return (
    <div data-closing={closing || undefined}
      className="botdom-members-scrim fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("botdom.members.manageGroup", { name: group.name })}
        className="botdom-members-dialog flex max-h-[calc(100dvh-32px)] w-[540px] max-w-full flex-col overflow-hidden rounded-[20px] border border-hairline/40 bg-card shadow-2xl"
      >
        <header className="flex items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink">{t("botdom.members.manage")}</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-secondary">{group.name} · {t("botdom.members.count", { count: members.length })}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("common.close")} className="flex size-8 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          <p className="px-2 pb-1.5 text-[12px] text-ink-tertiary">{t("botdom.members.roomModelHint")}</p>
          <ul className="flex flex-col gap-1">
            {members.map((bot, index) => {
              const isLead = bot.id === lead;
              const held = Boolean(group.holds?.[bot.id]);
              const fresh = !group.memberIds.includes(bot.id);
              return <li key={bot.id} data-member-row={bot.id} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                className={cn("botdom-member-row flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-raised/50",
                  bot.id === initialBotId && "bg-raised/60 ring-1 ring-ink/15")}>
                <span className="relative shrink-0">
                  <BotAvatar bot={isLead ? { ...bot, supervisorGroupId: group.id } : bot} size={34} animated={false} />
                  {held && <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-card text-ink-secondary ring-1 ring-hairline"><Pause size={9} /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span data-bot-color={bot.color} className={cn("truncate text-[13.5px] font-medium", bot.color === "purple" ? "text-ink" : "bot-identity")}>{isLead ? t("botdom.members.lead") : bot.name}</span>
                    {isLead && <BotdomCrown size={12} className="shrink-0 text-amber-500" aria-hidden="true" />}
                    {fresh && <span className="shrink-0 rounded-full bg-success/12 px-1.5 text-[10.5px] leading-4 text-success">{t("botdom.members.adding")}</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-tertiary">{engineName(bot)}{held ? ` · ${t("botdom.members.paused")}` : ""}</span>
                </span>
                <span className="shrink-0"><ModelPicker bot={{ ...bot, modelSelection: roomMemberModel(group, bot), busy: bot.busy || busy || !membership.allowed || fresh }} threadId={group.threadId} contained size="sm" onModelChange={(selection) => void saveMemberModel(bot, selection)} /></span>
                {membership.allowed && !fresh && <button type="button" title={t(held ? "room.holds.resume" : "room.holds.stop", { name: bot.name })} aria-label={t(held ? "room.holds.resume" : "room.holds.stop", { name: bot.name })}
                  onClick={() => dispatch({ type: "setGroupHold", groupId: group.id, botId: bot.id, held: !held })}
                  className="botdom-press flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink">{held ? <Play size={14} /> : <Pause size={14} />}</button>}
                {membership.allowed && <button type="button" disabled={isLead || locked || members.length <= 1}
                  title={isLead ? t("botdom.members.keepLead") : t("botdom.members.remove")} aria-label={`${t("botdom.members.remove")} ${bot.name}`}
                  onClick={() => setMember(bot.id, false)}
                  className="botdom-press flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-25"><UserMinus size={14} /></button>}
              </li>;
            })}
          </ul>

          {membership.allowed && others.length > 0 && <section className="mt-3 border-t border-hairline/40 pt-2">
            <button type="button" aria-expanded={addOpen} onClick={() => setAddOpen((open) => !open)}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-ink-secondary hover:bg-raised/60 hover:text-ink">
              <Plus size={15} className={cn("transition-transform duration-200 motion-reduce:transition-none", addOpen && "rotate-45")} />{t("botdom.members.addEmployees", { count: others.length })}
            </button>
            {addOpen && <ul className="botdom-member-add-list mt-1 flex flex-col gap-0.5">
              {others.map((bot) => <li key={bot.id} className="flex items-center gap-3 rounded-xl px-2.5 py-1.5 hover:bg-raised/50">
                <BotAvatar bot={bot} size={26} animated={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{bot.name}</span>
                  <span className="block truncate text-[11px] text-ink-tertiary">{engineName(bot)}</span>
                </span>
                <button type="button" disabled={locked} onClick={() => setMember(bot.id, true)}
                  className="botdom-press rounded-full border border-hairline/70 bg-card px-3 py-1 text-[12px] text-ink hover:border-ink/30 disabled:opacity-40">{t("botdom.members.join")}</button>
              </li>)}
            </ul>}
          </section>}
        </div>

        {(busy || saveError || !memberIds.length) && <div className="px-5 pt-1 text-[12px]">
          {!memberIds.length && <p className="text-ink-secondary">{t("botdom.members.keepOne")}</p>}
          {busy && <p className="text-ink-secondary">{t("botdom.members.busy")}</p>}
          {saveError && <p role="alert" className="text-danger">{saveError}</p>}
        </div>}
        <footer className="flex items-center gap-2 border-t border-hairline/40 px-5 py-3">
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-tertiary">{changed ? t("botdom.members.pending") : ""}</span>
          <button type="button" onClick={close} className="rounded-xl px-4 py-2 text-[13.5px] text-ink-secondary hover:bg-raised hover:text-ink">{t("common.cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={!changed || !memberIds.length || busy || saving || !membership.allowed}
            className="botdom-press rounded-xl bg-ink px-4 py-2 text-[13.5px] font-medium text-card hover:opacity-85 disabled:opacity-30">
            {t("botdom.members.save", { count: memberIds.length })}
          </button>
        </footer>
      </div>
    </div>
  );
}
