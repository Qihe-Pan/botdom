import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { formatTokens, hasFiniteCost } from "@/lib/usage";
import {
  formatCost, formatDuration, formatTick, groupLabel, timeAxis, toolLabel, traceBadges, traceRows, type TraceRow,
} from "@/lib/usage-trace";
import { useStore, type InstanceInfo } from "@/state/store";
import type { TraceDetail, TraceNode, TraceRootSummary, TraceTotals } from "../../../shared/usage-trace";
import { appName, StepIcon, ToolIcon, TurnAvatar, useAppCards } from "./TraceIcon";

export function modelName(model: string, instances: readonly InstanceInfo[]): string {
  for (const instance of instances) {
    const label = instance.models?.options?.find((option) => option.id === model)?.label;
    if (label) return label;
  }
  return model;
}

export function LiveBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent/12 px-2.5 py-1 text-[13px] font-medium text-accent" data-testid="trace-live">
      <span className="size-1.5 animate-pulse rounded-full bg-accent" />{t("trace.live")}
    </span>
  );
}

export function StatStrip({ items }: { items: Array<{ label: string; value: string; tone?: "danger"; hint?: string }> }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 px-4 pb-1 pt-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-xl bg-panel px-3.5 py-3" title={item.hint}>
          <dt className="truncate text-[12px] text-ink-secondary">{item.label}</dt>
          <dd className={cn("mt-1 whitespace-nowrap text-[20px] font-normal tabular-nums", item.tone === "danger" ? "text-danger" : "text-ink")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function totalsStats(totals: TraceTotals & { usageStatus?: TraceRootSummary["usageStatus"] }, timeLabel: string) {
  const partial = totals.usageStatus === "partial" || totals.usageStatus === "unavailable";
  return [
    { label: timeLabel, value: formatDuration(totals.durationMs) || "—" },
    ...(totals.costUsd ? [{ label: t("trace.stat.cost"), value: formatCost(totals.costUsd) }] : []),
    {
      label: t("trace.stat.tokens"), value: totals.tokens ? `${formatTokens(totals.tokens)}${partial ? "*" : ""}` : partial ? t("trace.partial") : "0",
      hint: t("trace.tokensHover", { input: formatTokens(totals.input), cached: formatTokens(totals.cachedInput), output: formatTokens(totals.output) }) +
        (partial ? `\n${t("trace.partialHint")}` : ""),
    },
    { label: t("trace.stat.steps"), value: String(totals.steps) },
    { label: t("trace.stat.tools"), value: String(totals.tools) },
    ...(totals.errors ? [{ label: t("trace.stat.errors"), value: String(totals.errors), tone: "danger" as const }] : []),
  ];
}

function rowFailed(node: TraceNode): boolean {
  if (node.kind === "tool" || node.kind === "turn") return node.status === "error";
  return node.kind === "group" && node.errors > 0;
}

function tokenLine(node: TraceNode): string | null {
  const tokens = node.kind === "turn" || node.kind === "step" ? node.tokens : undefined;
  if (!tokens) return node.kind === "step" ? t("trace.partialHint") : null;
  const lines = [t("trace.tokensHover", { input: formatTokens(tokens.input), cached: formatTokens(tokens.cachedInput), output: formatTokens(tokens.output) })];
  if (tokens.cacheWrite) lines.push(t("trace.cacheWrite", { tokens: formatTokens(tokens.cacheWrite) }));
  if (tokens.reasoning) lines.push(t("trace.reasoning", { tokens: formatTokens(tokens.reasoning) }));
  const context = node.kind === "turn" || node.kind === "step" ? node : null;
  if (context?.contextTokens && context.contextWindow) {
    lines.push(t("trace.context", { tokens: formatTokens(context.contextTokens), window: formatTokens(context.contextWindow) }));
  }
  if (node.kind === "turn" && node.usageStatus !== "complete") lines.push(t("trace.partialHint"));
  return lines.join("\n");
}

function RowName({ row, models, badges }: { row: TraceRow; models: readonly InstanceInfo[]; badges: { slowest?: string; costliest?: string } }) {
  const { state } = useStore();
  const catalog = useAppCards();
  const node = row.node;
  const failed = rowFailed(node);
  let icon: ReactNode;
  let name: string;
  let detail: string | undefined;
  switch (node.kind) {
    case "turn":
      icon = <TurnAvatar bot={state.bots.find((bot) => bot.id === node.botId)} name={node.botName} />;
      name = state.groups.some((group) => group.supervisorId === node.botId) ? t("botdom.members.lead") : node.botName || t("trace.unknownBot");
      detail = modelName(node.model, models);
      break;
    case "step":
      icon = <StepIcon />;
      name = t("trace.step");
      detail = node.tokens ? t("trace.stepTokens", { tokens: formatTokens(node.tokens.output) }) : undefined;
      break;
    case "group":
      icon = <ToolIcon icon={node.icon} app={node.app} catalog={catalog} error={failed} />;
      name = groupLabel(node, appName(node.app, catalog));
      detail = node.errors ? t("trace.groupErrors", { count: String(node.errors) }) : undefined;
      break;
    default:
      icon = <ToolIcon icon={node.icon} app={node.app} catalog={catalog} error={failed} />;
      name = node.icon === "app" && node.app ? `${appName(node.app, catalog)} · ${toolLabel(node)}` : toolLabel(node);
      detail = failed && node.error ? node.error : node.status === "ended" ? t("trace.endedWithTurn") : node.detail;
  }
  return (
    <>
      {icon}
      <span title={name} className={cn("min-w-0 shrink truncate text-[14px]", node.kind === "turn" ? "font-medium text-ink" : "text-ink", failed && "text-danger")}>{name}</span>
      {detail && <span title={detail} className={cn("min-w-0 shrink-[3] truncate text-[12.5px]", failed ? "text-danger/80" : "text-ink-tertiary")}>{detail}</span>}
      {badges.slowest === node.id && <Badge kind="slowest" />}
      {badges.costliest === node.id && <Badge kind="costliest" />}
      {node.kind === "turn" && !node.timed && <span className="shrink-0 rounded-full bg-raised px-1.5 text-[11px] text-ink-secondary">{t("trace.notTimed")}</span>}
    </>
  );
}

function barClass(row: TraceRow): string {
  const node = row.node;
  if (rowFailed(node) && node.kind !== "turn" && node.kind !== "group") return "trace-bar trace-bar-error";
  if (node.kind === "turn") return cn("trace-bar trace-bar-span", node.running && "trace-bar-running", node.status === "error" && "trace-bar-span-error");
  if (node.kind === "group") return cn("trace-bar trace-bar-tool trace-bar-group", node.errors > 0 && "trace-bar-span-error");
  if (node.kind === "step") return cn("trace-bar trace-bar-step", node.running && "trace-bar-running");
  return cn("trace-bar trace-bar-tool", node.running && "trace-bar-running");
}

function Badge({ kind }: { kind: "slowest" | "costliest" }) {
  return (
    <span className={cn(
      "ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
      kind === "slowest" ? "bg-warning/15 text-warning" : "bg-accent/12 text-accent",
    )}>{t(kind === "slowest" ? "trace.slowest" : "trace.costliest")}</span>
  );
}

/** Where a bar's label fits: after the bar, before it, or over its end. */
export function labelPlace(startPct: number, endPct: number, labelPx: number, trackPx: number): "after" | "before" | "inside" {
  const room = (pct: number) => (pct / 100) * trackPx;
  if (trackPx - room(endPct) >= labelPx + 12) return "after";
  if (room(startPct) >= labelPx + 12) return "before";
  return "inside";
}

const CHAR_PX = 7.2;

function RowBar({ row, origin, axisMax, now, trackPx }: {
  row: TraceRow; origin: number; axisMax: number; now: number; trackPx: number;
}) {
  const node = row.node;
  const point = (node.kind === "turn" && !node.timed) || (node.kind === "tool" && node.endedAt === undefined && !node.running);
  const startPct = Math.max(0, Math.min(100, ((row.start - origin) / axisMax) * 100));
  const endPct = Math.max(startPct, Math.min(100, (((node.running ? now : row.end) - origin) / axisMax) * 100));
  const width = endPct - startPct;
  const label = [
    point ? null : formatDuration(row.durationMs),
    hasFiniteCost(row.costUsd) ? formatCost(row.costUsd) : null,
  ].filter(Boolean).join(" · ");
  const place = labelPlace(startPct, endPct, label.length * CHAR_PX, trackPx);
  const labelStyle: CSSProperties = place === "after" ? { left: `calc(${endPct}% + 8px)` }
    : place === "before" ? { right: `calc(${100 - startPct}% + 8px)` } : { right: `calc(${100 - endPct}% + 8px)` };
  return (
    <>
      {point
        ? <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-ink-tertiary" style={{ left: `${startPct}%` }} />
        : <span className={cn("absolute top-1/2 h-[18px] -translate-y-1/2 rounded-full", barClass(row))} style={{ left: `${startPct}%`, width: `max(${width}%, 3px)` }} />}
      <span className={cn("absolute top-1/2 flex -translate-y-1/2 items-center whitespace-nowrap text-[13px] tabular-nums", place === "inside" ? "text-ink" : "text-ink-secondary")} style={labelStyle}>
        {label}
      </span>
    </>
  );
}

/** The trace waterfall: a stat strip, then a collapsible span tree beside a time axis. */
export function TraceWaterfall({ detail, now, actions }: { detail: TraceDetail; now: number; actions?: ReactNode }) {
  const { state } = useStore();
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const root = detail.root;
  const live = root.running;
  const rows = useMemo(() => traceRows(detail.turns, toggled, now), [detail, toggled, now]);
  const badges = useMemo(() => traceBadges(detail.turns, now), [detail, now]);
  const origin = root.startedAt;
  const span = Math.max((live ? now : root.endedAt) - origin, 1);
  const axis = timeAxis(span);
  const track = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(600);
  useEffect(() => {
    const node = track.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setTrackPx(entry.contentRect.width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const nowPct = live ? ((now - origin) / axis.max) * 100 : null;
  const grid: CSSProperties = {
    backgroundImage: "linear-gradient(to right, color-mix(in srgb, var(--color-hairline) 30%, transparent) 1px, transparent 1px)",
    backgroundSize: `${100 / (axis.ticks.length - 1)}% 100%`,
  };
  const toggle = (id: string) => setToggled((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const title = (root.title || t(`trace.source.${root.source}`, { bot: root.bots[0]?.name ?? "" })).replace(/^(@[^\s]+(\s·\s[^\s]+)*\s*)+/, "").trim() || root.title;

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline/50 bg-card [&_[role=tree]]:select-none" data-testid="trace-waterfall" aria-label={t("trace.title")}>
      <header className="flex items-center gap-3 px-5 pb-1 pt-4">
        <Sparkles size={16} className="shrink-0 text-accent" aria-hidden />
        <span className="shrink-0 text-[15px] font-semibold text-ink">{t("trace.title")}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] text-ink-secondary" title={title}>{title}</span>
        {live && <LiveBadge />}
        {actions}
      </header>
      <StatStrip items={totalsStats(root, t("trace.stat.duration"))} />
      <div role="tree" aria-label={t("trace.spans")} className="px-2 pb-2 pt-2">
        <div className="mx-1 grid grid-cols-1 rounded-lg bg-panel/70 sm:grid-cols-[minmax(220px,38%)_1fr]">
          <div className="hidden px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-secondary sm:block">{t("trace.span")}</div>
          <div ref={track} className="relative mx-4 h-8 sm:ml-0 sm:mr-6">
            {axis.ticks.map((tick, index) => (
              <span
                key={tick}
                className={cn("absolute top-1/2 -translate-y-1/2 text-[12px] tabular-nums text-ink-tertiary", index === axis.ticks.length - 1 ? "-translate-x-full" : index > 0 && "-translate-x-1/2", index === 0 && "pl-2")}
                style={{ left: `${(tick / axis.max) * 100}%` }}
              >{formatTick(tick)}</span>
            ))}
            {nowPct !== null && <span className="absolute bottom-0 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent" style={{ left: `${nowPct}%` }} />}
          </div>
        </div>
        <div className="py-1.5">
          {rows.map((row) => {
            const tokens = tokenLine(row.node);
            return (
              <div
                key={row.node.id}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.expandable ? row.open : undefined}
                className="group mx-1 grid grid-cols-1 rounded-xl transition-colors hover:bg-raised/40 motion-reduce:transition-none sm:grid-cols-[minmax(220px,38%)_1fr]"
                title={tokens ?? undefined}
                data-kind={row.node.kind}
              >
                <div className="flex h-9 min-w-0 items-center gap-2 pr-3" style={{ paddingLeft: 12 + row.depth * 18 }}>
                  {row.expandable ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.node.id)}
                      className="flex size-5 shrink-0 items-center justify-center rounded-md text-ink-secondary hover:bg-raised hover:text-ink"
                      aria-label={t(row.open ? "trace.collapse" : "trace.expand")}
                    >
                      {row.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : <span className="w-5 shrink-0" />}
                  <RowName row={row} models={state.instances} badges={badges} />
                  {rowFailed(row.node) && row.node.kind === "turn" && <X size={13} className="shrink-0 text-danger" aria-label={t("trace.failed")} />}
                </div>
                <div className="relative mx-4 h-7 sm:ml-0 sm:mr-6 sm:h-9" style={grid}>
                  <RowBar row={row} origin={origin} axisMax={axis.max} now={now} trackPx={trackPx} />
                  {nowPct !== null && <span className="absolute inset-y-0 w-px bg-accent/70" style={{ left: `${nowPct}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
