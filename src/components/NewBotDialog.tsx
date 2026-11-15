import { useEffect, useRef, useState } from "react";
import { Check, Dices, Loader2, X } from "lucide-react";
import { api, BotEditorStore, useStore, type Bot, type InstanceInfo } from "@/state/store";
import { BotCreationDraft, EMPTY_BOT_DEFAULTS } from "@/lib/bot-creation-draft";
import { createConfiguredBot, preparedBotTemplate } from "@/lib/create-configured-bot";
import { readyBot, readyBotTemplate } from "@/lib/ready-bots";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { announceNewBot, reportsToFor, startingTemplate, type BotDefaultsAnswer } from "@/lib/new-bot";
import { randomBotName } from "@/lib/random-bot-name";
import { useShowThreads } from "@/lib/thread-preferences";
import { useTeamPeople } from "@/state/team-people";
import { BotEditorContext } from "./bot-settings/BotEditorContext";
import { useBotSettingsDerived } from "./bot-settings/useBotSettingsDerived";
import { EmployeeAvatarPicker } from "./EmployeeAvatarPicker";
import { LocalComputerAutoWarning } from "./LocalComputerAutoWarning";
import { SharePresetDialog } from "./SharePresetDialog";
import { SettingRow } from "./SettingsPrimitives";

let defaultsCache: BotDefaultsAnswer | null = null;
let defaultsRequest: Promise<BotDefaultsAnswer> | null = null;

/** Probing every engine makes the first answer slow; the dialog opens from this cache and refreshes behind it. */
export function prefetchBotDefaults(): Promise<BotDefaultsAnswer> {
  defaultsRequest ??= api<BotDefaultsAnswer>("/api/bot-defaults")
    .then((answer) => { defaultsCache = answer; return answer; })
    .finally(() => { defaultsRequest = null; });
  return defaultsRequest;
}

const connectedEngines = (instances: readonly InstanceInfo[]) =>
  instances.filter((instance) => instance.snapshot.state === "available" && instance.snapshot.authenticated !== false && instance.models.default.trim());

const fieldCls = "w-full rounded-xl border border-hairline/50 bg-composer px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-tertiary transition-colors focus:border-ink/40 focus:outline-none";
const labelCls = "mb-2 block text-[12px] font-medium text-ink-secondary";

/** New employee, or the New bot defaults (`defaultsMode`); a ready-made bot from Templates opens filled in. */
export function NewBotDialog({ defaultsMode = false, onClose, onCreated, readyBotId }: {
  defaultsMode?: boolean; onClose: () => void; onCreated?: (bot: Bot) => void | Promise<void>;
  readyBotId?: string;
}) {
  const parent = useStore();
  const [, render] = useState(0);
  const engines = connectedEngines(parent.state.instances);
  const touched = useRef(false);
  const build = (answer: BotDefaultsAnswer) => {
    const defaults = startingTemplate(answer, !defaultsMode);
    const ready = defaultsMode || !readyBotId ? undefined : readyBot(readyBotId);
    const next = new BotCreationDraft(ready ? readyBotTemplate(defaults, ready) : defaults, () => render((value) => value + 1));
    if (ready) next.role = ready.id;
    return next;
  };
  const [draft, setDraft] = useState(() => build(defaultsCache ?? {
    defaults: EMPTY_BOT_DEFAULTS,
    modelSelection: engines[0] ? { instanceId: engines[0].instanceId, model: engines[0].models.default } : { instanceId: "", model: "" },
    suggestedName: randomBotName("female", "", parent.state.bots.map((bot) => bot.name)),
  }));
  const [localSaving, setSaving] = useState(false);
  const saving = localSaving || parent.state.botCreationPending;
  const savingRef = useRef(false);
  const alive = useRef(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<"local" | null>(null);
  const team = useTeamPeople();
  const showThreads = useShowThreads();
  const connected = engines.some((instance) => instance.instanceId === draft.bot.modelSelection.instanceId);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    let cancelled = false;
    void prefetchBotDefaults()
      .then((answer) => { if (!cancelled && !touched.current) setDraft(buildRef.current(answer)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [defaultsMode, readyBotId]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => draft.dispose(), [draft]);
  // Disabling the focused Create button drops focus to the page in Chromium.
  useEffect(() => { if (saving) dialog.current?.focus(); }, [saving]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      const root = dialog.current;
      if (!root || (event.target instanceof Node && !root.contains(event.target))) return;
      const nested = root.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      if (nested && nested.getClientRects().length) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
        .filter((control) => control.getClientRects().length && !control.closest("[hidden],fieldset:disabled"));
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  const save = async () => {
    if (savingRef.current || parent.state.botCreationPending) return;
    if (!defaultsMode && draft.bot.approvalMode === "auto" && draft.bot.computer === "local" && !draft.consent.acknowledgeLocalAuto) { setWarning("local"); return; }
    if (!defaultsMode && !connected) { setError(t("p0.bot.connectEngine")); return; }
    savingRef.current = true; setSaving(true); setError("");
    parent.dispatch({ type: "botCreationPending", on: true });
    try {
      if (defaultsMode) await api("/api/config", { method: "PATCH", body: JSON.stringify({ newBotDefaults: await preparedBotTemplate(draft) }) });
      else {
        const { bot, warnings } = await createConfiguredBot(draft, undefined, undefined, undefined, undefined,
          team ? reportsToFor(null, draft.bot.section, parent.state.bots, team) ?? undefined : undefined);
        announceNewBot(parent.dispatch, bot, warnings, { showThreads, source: draft.preset ? "preset" : draft.role ? "template" : "blank", role: draft.role });
        try { await onCreated?.(bot); }
        catch (cause) { parent.dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }); }
      }
      savingRef.current = false; if (alive.current) closeRef.current();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally {
      savingRef.current = false;
      parent.dispatch({ type: "botCreationPending", on: false });
      if (alive.current) setSaving(false);
    }
  };
  const bot = draft.bot;
  const scopedStore: ReturnType<typeof useStore> = {
    ...parent,
    state: { ...parent.state, bots: [bot, ...parent.state.bots], routines: draft.routines, routineRuns: [], routinesLoadState: "ready" },
    flushBotPatches: async () => bot,
    dispatch: (action) => {
      if (action.type === "updateBot" && action.botId === draft.id) draft.patch(action.patch);
      else if (action.type === "setModel" && action.botId === draft.id) {
        draft.setModel(action.selection);
        if (action.resetApprovalToAsk) draft.patch({ approvalMode: "ask" });
      } else if (action.type === "routinePatched" || action.type === "toggleSettings") {}
      else parent.dispatch(action);
    },
  };
  const title = defaultsMode ? t("newBot.defaults") : t("sidebar.newBot");
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-3 backdrop-blur-[2px] sm:p-5" hidden={!defaultsMode && parent.state.appSettingsOpen}
    onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRef.current && !saving) closeRef.current(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} aria-busy={saving} tabIndex={-1}
      className="flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] border border-hairline/40 bg-panel shadow-2xl outline-none">
      <div className="flex shrink-0 items-center justify-between px-6 pb-1 pt-5">
        <h2 className="text-[17px] font-normal text-ink">{title}</h2>
        <button type="button" onClick={() => closeRef.current()} aria-label={t("common.close")}
          className="flex size-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink"><X size={18} className="pointer-events-none" /></button>
      </div>
      <fieldset disabled={saving} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-2 pt-3"
        onInputCapture={() => { touched.current = true; }} onClickCapture={() => { touched.current = true; }}>
        <BotEditorStore value={scopedStore}><BotEditorContext.Provider value={{ request: draft.request, draft: true, uploadAvatar: draft.uploadAvatar }}>
          <DraftFields draft={draft} defaultsMode={defaultsMode} />
          <div className="mt-5">
            <span className={labelCls}>{t("p0.bot.model")}</span>
            {engines.length ? <div role="radiogroup" aria-label={t("p0.bot.model")} className="grid grid-cols-2 gap-2">
              {engines.map((instance) => {
                const on = instance.instanceId === bot.modelSelection.instanceId;
                return <button type="button" role="radio" aria-checked={on} key={instance.instanceId}
                  onClick={() => draft.setModel({ instanceId: instance.instanceId, model: instance.models.default })}
                  className={cn("botdom-press flex items-center gap-2 rounded-xl border px-3 py-2 text-left",
                    on ? "border-ink/50 bg-app shadow-sm" : "border-hairline/50 hover:border-hairline hover:bg-control/40")}>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={instance.models.default}>{instance.displayName}</span>
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full", on ? "botdom-pop bg-ink text-card" : "border border-hairline")}>{on && <Check size={11} strokeWidth={3} />}</span>
                </button>;
              })}
            </div> : <p role="status" className="text-[13px] text-ink-secondary">{t("p0.bot.connectEngine")}</p>}
          </div>
        </BotEditorContext.Provider></BotEditorStore>
      </fieldset>
      {error && <p role="alert" className="mx-6 mt-2 max-h-24 overflow-y-auto rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
      <div className="flex shrink-0 justify-end gap-2 px-6 pb-5 pt-4">
        <button type="button" onClick={() => closeRef.current()} className="rounded-xl px-4 py-2 text-[13px] text-ink-secondary hover:bg-control hover:text-ink">{t("common.cancel")}</button>
        <button type="button" disabled={saving || (!defaultsMode && (!bot.name.trim() || !connected))} onClick={() => void save()}
          className="botdom-press flex items-center gap-2 rounded-xl bg-ink px-5 py-2 text-[13px] text-card hover:opacity-85 disabled:opacity-40">
          {saving && <Loader2 size={15} className="animate-spin" />}{t(defaultsMode ? "newBot.saveDefaults" : "newBot.create")}
        </button>
      </div>
      <LocalComputerAutoWarning open={warning === "local"} onCancel={() => setWarning(null)} onConfirm={() => { draft.consent.acknowledgeLocalAuto = true; setWarning(null); void save(); }} />
    </div>
  </div>;
}

function DraftFields({ draft, defaultsMode }: { draft: BotCreationDraft; defaultsMode: boolean }) {
  const { state } = useStore();
  const bot = draft.bot;
  const derived = useBotSettingsDerived(bot);
  return <div className="space-y-5">
    <EmployeeAvatarPicker bot={bot} onPatch={derived.patch} />
    <div>
      <label htmlFor="new-bot-name" className={labelCls}>{t("botSettings.identity.name")}</label>
      <div className="relative">
        <input id="new-bot-name" data-new-bot-name className={cn(fieldCls, "pr-11")} value={bot.name} maxLength={80}
          placeholder={defaultsMode ? t("newBot.randomName") : undefined} onChange={(event) => draft.patch({ name: event.target.value })} />
        <button type="button" title={t("newBot.randomFemaleName")} aria-label={t("newBot.randomFemaleName")}
          onClick={() => draft.patch({ name: randomBotName(Math.random() < 0.5 ? "female" : "male", bot.name, state.bots.map((existing) => existing.name)) })}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink">
          <Dices size={16} />
        </button>
      </div>
    </div>
    <div>
      <label htmlFor="new-bot-role" className={labelCls}>{t("p0.bot.responsibility")}</label>
      <textarea id="new-bot-role" rows={2} className={cn(fieldCls, "resize-none leading-6")} value={bot.description} maxLength={3000}
        placeholder={t("p0.bot.responsibilityPlaceholder")}
        onChange={(event) => draft.patch({ description: event.target.value, soul: event.target.value })} />
    </div>
  </div>;
}

export function DefaultBotSettings() {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const content = <>
    <div className="flex shrink-0 gap-2">
      <button type="button" onClick={() => setSharing(true)} className="cursor-pointer rounded-lg px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-control hover:text-ink">{t("newBot.sharePreset")}</button>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer rounded-lg bg-control px-3 py-1.5 text-[13px] text-ink hover:bg-raised-hover">{t("newBot.edit")}</button>
    </div>
    {open && <NewBotDialog defaultsMode onClose={() => setOpen(false)} />}
    {sharing && <SharePresetDialog onClose={() => setSharing(false)} />}
  </>;
  return <SettingRow title={t("newBot.defaults")} children={content} />;
}
