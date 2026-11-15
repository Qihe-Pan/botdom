import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { activeLocale, documentLanguage, t } from "@/lib/i18n";
import { listenLiveFrames } from "@/lib/live-events";
import { formatTokens, hasFiniteCost, headlineTokens } from "@/lib/usage";
import { fetchTraces, formatCost, formatDuration, USAGE_PERIODS, usageExportHref, usagePeriodRange, type UsagePeriod } from "@/lib/usage-trace";
import { api, useStore } from "@/state/store";
import type { LocaleKey } from "@/locales";
import type { TraceList, TraceRootSummary, TraceTotals } from "../../shared/usage-trace";
import { BotAvatar } from "./Avatar";
import { PlanUsage } from "./PlanUsage";
import { Select } from "./Select";
import { UsageBudgetCards, type BudgetState } from "./UsageBudget";
import { TraceView } from "./usage/TraceView";
import { LiveBadge, modelName } from "./usage/TraceWaterfall";

export type UsageGroupBy = "bot" | "model" | "user" | "day" | "engine" | "routine" | "department";
const OTHER_GROUPINGS: readonly UsageGroupBy[] = ["model", "engine", "day"];

export interface UsageGroup {
  key: string;
  label: string;
  turns: number;
  input: number;
  output: number;
  cachedInput: number;
  costUsd: number | null;
}

interface UsageSummary {
  groupBy: UsageGroupBy;
  groups: UsageGroup[];
  budget?: BudgetState | null;
}

const GROUP_LABEL_KEYS: Record<UsageGroupBy, LocaleKey> = {
  bot: "usage.history.byBot",
  model: "usage.history.byModel",
  user: "usage.history.byUser",
  day: "usage.history.byDay",
  engine: "usage.history.byEngine",
  routine: "usage.history.byRoutine",
  department: "usage.history.byDepartment",
};

const PERIOD_LABEL_KEYS: Record<UsagePeriod, LocaleKey> = {
  today: "usage.page.today",
  week: "usage.page.week",
  month: "usage.history.thisMonth",
  lastMonth: "usage.history.lastMonth",
  days30: "usage.history.last30Days",
};

const LIVE_REFRESH_MS = 2_000;

export function usageGroupLabel(groupBy: UsageGroupBy, group: Pick<UsageGroup, "key" | "label">): string {
  if (groupBy === "routine") return group.key === "manual" ? t("usage.history.notRoutine") : group.label;
  if (groupBy === "department") return group.label || t("usage.history.noDepartment");
  if (groupBy !== "user") return group.label;
  if (group.key === "owner") return t("usage.history.owner");
  if (group.key === "bot") return t("usage.history.botToBot");
  if (group.key.startsWith("routine:")) return t("usage.history.routine", { name: group.label.replace(/^Routine: /, "") });
  return group.label;
}

function useUsageGroups(range: { from: string; to: string }, groupBy: UsageGroupBy, version: number): UsageSummary | null {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  useEffect(() => {
    let current = true;
    void api(`/api/usage?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&groupBy=${groupBy}`)
      .then((next: UsageSummary) => { if (current) setSummary(next); })
      .catch(() => { if (current) setSummary(null); });
    return () => { current = false; };
  }, [range.from, range.to, groupBy, version]);
  return summary;
}

/** Rows the person reads as one thing: model ids that differ only in case share a display name. */
function mergedGroups(groupBy: UsageGroupBy, groups: readonly UsageGroup[], label: (group: UsageGroup) => string): Array<UsageGroup & { name: string }> {
  if (groupBy !== "model") return groups.map((group) => ({ ...group, name: label(group) }));
  const merged = new Map<string, UsageGroup & { name: string }>();
  for (const group of groups) {
    const name = label(group);
    const key = name.toLowerCase();
    const seen = merged.get(key);
    if (!seen) { merged.set(key, { ...group, name }); continue; }
    merged.set(key, { ...seen, turns: seen.turns + group.turns, input: seen.input + group.input, output: seen.output + group.output,
      cachedInput: seen.cachedInput + group.cachedInput,
      costUsd: hasFiniteCost(seen.costUsd) || hasFiniteCost(group.costUsd) ? (seen.costUsd ?? 0) + (group.costUsd ?? 0) : null,
      name: /[A-Z]/.test(name) ? name : seen.name });
  }
  return [...merged.values()];
}

/** Every token a group used: new input, cache reads and output, so the rows add up to the period's total. */
const allTokens = (u: { input: number; output: number }) => Math.max(0, u.input) + Math.max(0, u.output);

export function GroupBars({ groupBy, groups }: { groupBy: UsageGroupBy; groups: readonly UsageGroup[] }) {
  const { state } = useStore();
  const label = (group: UsageGroup) => groupBy === "model" ? modelName(group.label, state.instances) : usageGroupLabel(groupBy, group);
  const top = mergedGroups(groupBy, groups, label).sort((a, b) => allTokens(b) - allTokens(a)).slice(0, 6);
  const max = Math.max(...top.map(headlineTokens), 0);
  if (!top.length || max <= 0) return <p className="text-[13px] text-ink-secondary">{t("usage.page.whereEmpty")}</p>;
  const costs = top.some((group) => hasFiniteCost(group.costUsd) && group.costUsd > 0);
  return (
    <ul className="flex flex-col">
      {top.map((group) => {
        const bot = groupBy === "bot" ? state.bots.find((item) => `bot:${item.id}` === group.key) : undefined;
        const gone = groupBy === "bot" && !bot;
        const cost = hasFiniteCost(group.costUsd) && group.costUsd > 0 ? formatCost(group.costUsd) : "";
        return (
          <li key={group.key} className="min-w-0 rounded-lg px-1 py-1.5 text-[13px]" title={`${group.name} · ${t("usage.page.turns", { count: String(group.turns) })} · ${t("trace.tokensHover", { input: formatTokens(group.input), cached: formatTokens(group.cachedInput ?? 0), output: formatTokens(group.output) })}`}>
            <div className="flex min-w-0 items-center gap-2">
              {groupBy === "bot" && (bot ? <BotAvatar bot={bot} state="idle" size={18} animated={false} />
                : <span aria-hidden="true" className="size-[18px] shrink-0 rounded-full border border-dashed border-hairline" />)}
              <span className={cn("min-w-0 flex-1 truncate leading-5", gone ? "text-ink-tertiary" : "text-ink")}>{group.name}</span>
              {gone && <span className="shrink-0 rounded-full bg-raised px-1.5 text-[10.5px] leading-4 text-ink-tertiary">{t("usage.page.deleted")}</span>}
              <span className="shrink-0 tabular-nums text-ink-secondary">{formatTokens(allTokens(group))}</span>
              {costs && <span className="min-w-14 shrink-0 text-right tabular-nums text-ink">{cost}</span>}
            </div>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              <span data-bot-color={bot?.color} className={cn("block h-full rounded-full", bot?.color ? "bot-identity bg-current opacity-80" : "bg-accent/70")}
                style={{ width: `${Math.max(3, (allTokens(group) / max) * 100)}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The period at a glance: what it cost, then how much work that bought. */
function UsageOverview({ totals, period }: { totals: TraceTotals & { usageStatus?: TraceRootSummary["usageStatus"] }; period: string }) {
  const partial = totals.usageStatus === "partial" || totals.usageStatus === "unavailable";
  // The same measure as the per-bot and per-model bars: fresh input plus output. Cache reads are listed apart, or the
  // headline would dwarf rows that cannot add up to it.
  const cacheReads = Math.min(Math.max(0, totals.cachedInput ?? 0), totals.input);
  const total = allTokens(totals);
  const tokens = total ? `${formatTokens(total)}${partial ? "*" : ""}` : partial ? t("trace.partial") : "0";
  const hasCost = hasFiniteCost(totals.costUsd) && totals.costUsd > 0;
  const errors = (totals as TraceTotals & { errors?: number }).errors ?? 0;
  const split = totals.toolErrors !== undefined && totals.turnErrors !== undefined
    ? t("usage.page.errorSplit", { tools: String(totals.toolErrors), turns: String(totals.turnErrors) })
    : totals.tools ? t("usage.page.errorRate", { rate: `${Math.round((errors / totals.tools) * 1000) / 10}%` }) : "";
  const secondary = [
    { label: t("trace.stat.time"), value: formatDuration(totals.durationMs) || "—" },
    // Tokens spelled out: what was new to the model, what it re-read from cache, and what it wrote.
    { label: t("usage.page.freshInput"), value: formatTokens(Math.max(0, totals.input - cacheReads)) },
    { label: t("usage.page.cacheRead"), value: formatTokens(cacheReads) },
    { label: t("usage.page.output"), value: formatTokens(totals.output) },
    { label: t("trace.stat.steps"), value: totals.steps.toLocaleString() },
    { label: t("trace.stat.tools"), value: totals.tools.toLocaleString() },
  ];
  return (
    <div className="botdom-usage-overview">
      <div className="botdom-usage-headline">
        <p className="text-[12px] text-ink-secondary">{t(hasCost ? "usage.page.spent" : "usage.page.used", { period })}</p>
        <p className="mt-1 text-[32px] font-normal leading-none tracking-tight tabular-nums text-ink">{hasCost ? formatCost(totals.costUsd) : tokens}</p>
        {(hasCost || errors > 0) && <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] tabular-nums text-ink-secondary">
          {hasCost && <span>{t("usage.page.tokensLine", { tokens })}</span>}
          {errors > 0 && <span title={split || undefined} className="whitespace-nowrap rounded-full bg-danger/10 px-2 py-px font-medium text-danger">{t("usage.page.errorsTag", { count: errors.toLocaleString() })}</span>}
        </p>}
      </div>
      <dl className="botdom-usage-stats grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-4 border-hairline/50">
        {secondary.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="truncate text-[12px] text-ink-secondary">{item.label}</dt>
            <dd className="mt-1 truncate text-[20px] font-normal tabular-nums text-ink">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function WhereItWent({ range, version, onBudget }: { range: { from: string; to: string }; version: number; onBudget: (budget: BudgetState | null) => void }) {
  const [other, setOther] = useState<UsageGroupBy>("model");
  const byBot = useUsageGroups(range, "bot", version);
  const byOther = useUsageGroups(range, other, version);
  useEffect(() => { onBudget(byBot?.budget ?? null); }, [byBot, onBudget]);
  return (
    <section className="rounded-2xl border border-hairline/50 bg-card p-4" aria-label={t("usage.page.where")}>
      <h3 className="text-[13px] font-medium text-ink">{t("usage.page.where")}</h3>
      <div className="botdom-usage-breakdowns mt-3 grid min-w-0 gap-x-8 gap-y-6">
        <div className="min-w-0">
          <div className="mb-3 flex h-8 items-center px-1 text-[13px] font-medium text-ink">{t(GROUP_LABEL_KEYS.bot)}</div>
          {byBot ? <GroupBars groupBy="bot" groups={byBot.groups} /> : <Loader2 size={14} className="animate-spin text-ink-secondary" />}
        </div>
        <div className="min-w-0">
          <div role="tablist" aria-label={t("usage.history.groupBy")} className="mb-3 inline-flex h-8 items-center gap-0.5 rounded-lg bg-raised/70 p-0.5">
            {OTHER_GROUPINGS.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={other === option}
                onClick={() => setOther(option)}
                className={cn("h-7 rounded-md px-3 text-[12.5px] transition-colors motion-reduce:transition-none",
                  other === option ? "bg-card font-medium text-ink shadow-sm" : "text-ink-secondary hover:text-ink")}
              >{t(GROUP_LABEL_KEYS[option])}</button>
            ))}
          </div>
          {byOther?.groupBy === other ? <GroupBars groupBy={other} groups={byOther.groups} /> : <Loader2 size={14} className="animate-spin text-ink-secondary" />}
        </div>
      </div>
    </section>
  );
}

function startedLabel(at: number): string {
  return new Date(at).toLocaleString(documentLanguage(activeLocale()), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function RunRow({ root, onOpen }: { root: TraceRootSummary; onOpen: () => void }) {
  const { state } = useStore();
  const title = root.title || t(`trace.source.${root.source}`, { bot: root.bots[0]?.name ?? "" });
  const lead = root.bots[0];
  const leadBot = lead ? state.bots.find((item) => item.id === lead.id) : undefined;
  const others = root.bots.length - 1;
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-raised/50" data-testid="usage-run">
        <span className="relative flex size-8 shrink-0 items-center justify-center">
          {leadBot ? <BotAvatar bot={leadBot} state="idle" size={28} animated={false} />
            : <span className="flex size-7 items-center justify-center rounded-full bg-raised text-[11px] text-ink-secondary">{lead?.name.slice(0, 1).toUpperCase() ?? "·"}</span>}
          {others > 0 && <span className="absolute -bottom-0.5 -right-1 rounded-full bg-raised px-1 text-[10px] leading-4 tabular-nums text-ink-secondary">+{others}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{title}</span>
          <span className="block truncate text-[12px] text-ink-tertiary">{startedLabel(root.startedAt)} · {root.bots.map((bot) => bot.name).join("、")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-[12px] tabular-nums text-ink-secondary">
          {root.running && <LiveBadge />}
          {root.errors > 0 && <span className="rounded-md bg-danger/12 px-1.5 py-0.5 font-medium text-danger">{t("trace.groupErrors", { count: String(root.errors) })}</span>}
          {root.timed && <span>{formatDuration(root.durationMs)}</span>}
          {root.costUsd ? <span className="text-ink">{formatCost(root.costUsd)}</span> : null}
          <ChevronRight size={14} className="text-ink-tertiary" />
        </span>
      </button>
    </li>
  );
}

/** The Usage page: a period's totals, where the money went, and every run as a trace. */
export function UsageSection() {
  const [period, setPeriod] = useState<UsagePeriod>("month");
  const range = useMemo(() => usagePeriodRange(period), [period]);
  const [list, setList] = useState<TraceList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [open, setOpen] = useState<{ id: string; at: number } | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let current = true;
    void fetchTraces(range)
      .then((next) => { if (current) { setList(next); setError(null); } })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { current = false; };
  }, [range, version]);

  useEffect(() => listenLiveFrames({
    onFrame: (frame) => {
      if (frame.kind !== "runtime" || pending.current) return;
      const type = (frame.event as { type?: string } | undefined)?.type;
      if (type !== "turn.started" && type !== "turn.completed") return;
      pending.current = setTimeout(() => { pending.current = null; setVersion((value) => value + 1); }, LIVE_REFRESH_MS);
    },
    onMissedFrames: () => setVersion((value) => value + 1),
  }), []);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  const more = () => {
    if (!list?.next) return;
    void fetchTraces(range, list.next).then((page) => setList((current) => current ? { ...page, roots: [...current.roots, ...page.roots] } : page));
  };

  return (
    <div className="botdom-utility botdom-usage flex flex-col gap-4" data-testid="usage-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-secondary">{t("usage.page.subtitle")}</p>
        <div className="flex items-center gap-2">
          <Select size="sm" value={period} onChange={(event) => { setPeriod(event.target.value as UsagePeriod); setOpen(null); }} aria-label={t("usage.history.period")}>
            {USAGE_PERIODS.map((option) => <option key={option} value={option}>{t(PERIOD_LABEL_KEYS[option])}</option>)}
          </Select>
          <a href={usageExportHref(range)} download className="flex items-center gap-1.5 rounded-lg border border-hairline/40 px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-raised/50 hover:text-ink">
            <Download size={13} />{t("usage.history.export")}
          </a>
        </div>
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      {open ? (
        <TraceView id={open.id} at={open.at} actions={(
          <button type="button" onClick={() => setOpen(null)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-ink-secondary hover:bg-raised hover:text-ink">
            <ArrowLeft size={13} />{t("trace.back")}
          </button>
        )} />
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-hairline/50 bg-card" data-testid="usage-totals">
            {list ? <UsageOverview totals={list.totals} period={t(PERIOD_LABEL_KEYS[period])} />
              : <div className="flex items-center gap-2 p-5 text-[13px] text-ink-secondary"><Loader2 size={14} className="animate-spin" />{t("common.checking")}</div>}
          </section>
          <WhereItWent range={range} version={version} onBudget={setBudget} />
          <section className="rounded-2xl border border-hairline/50 bg-card p-2" aria-label={t("usage.page.runs")}>
            <div className="px-3 pb-1 pt-3">
              <h3 className="text-[13px] font-medium text-ink">{t("usage.page.runs")}</h3>
              <p className="mt-0.5 text-[13px] text-ink-secondary">{t("usage.page.runsHint")}</p>
            </div>
            {list && !list.roots.length && <p className="px-3 py-3 text-[13px] text-ink-secondary">{t("usage.page.runsEmpty")}</p>}
            <ul className="mt-1 flex flex-col">
              {list?.roots.map((root) => <RunRow key={root.id} root={root} onOpen={() => setOpen({ id: root.id, at: root.startedAt })} />)}
            </ul>
            {list?.next !== undefined && (
              <button type="button" onClick={more} className="m-2 rounded-lg px-3 py-1.5 text-[13px] text-accent hover:bg-raised/50">{t("usage.page.more")}</button>
            )}
          </section>
        </>
      )}
      <PlanUsage />
      <UsageBudgetCards budget={budget} />
    </div>
  );
}
