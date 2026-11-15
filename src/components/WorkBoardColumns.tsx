import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { WORK_BOARD_LANES, workBoardLayout, type BoardColumnPreferences, type WorkBoardLane } from "@/lib/work-board-layout";
import type { WorkBoardItem, WorkBoardView } from "@/lib/work-board";
import { todoLane } from "./RoomTaskBoard";
import "./work-board.css";

const TONE: Record<WorkBoardLane, string> = { todo: "bg-ink-tertiary", working: "bg-accent", blocked: "bg-danger", review: "bg-warning", done: "bg-success" };
const STORAGE_KEY = "botdom.work-board.columns.v1";

function readPreferences(): BoardColumnPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const valid = (value: unknown): WorkBoardLane[] => Array.isArray(value) ? value.filter(lane => WORK_BOARD_LANES.includes(lane)) : [];
    return { closed: valid(saved.closed), recent: valid(saved.recent) };
  } catch { return { closed: [], recent: [] }; }
}

export function WorkBoardColumns({ items, view, filterKey, renderCard }: { items: WorkBoardItem[]; view: WorkBoardView; filterKey: string; renderCard: (item: WorkBoardItem) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [preferences, setPreferences] = useState(readPreferences);
  const [openedEmpty, setOpenedEmpty] = useState<{ filterKey: string; lane: WorkBoardLane } | null>(null);
  const [limits, setLimits] = useState<Partial<Record<WorkBoardLane, number>>>({});
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => { if (element.clientWidth) setWidth(element.clientWidth); };
    measure();
    const observer = new ResizeObserver(entries => { const measuredWidth = entries[0]?.contentRect.width; if (measuredWidth) setWidth(measuredWidth); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const lanes = WORK_BOARD_LANES.filter(lane => view === "all" || lane === (view === "blocked" ? "blocked" : "review"));
  const rows = Object.fromEntries(lanes.map(lane => [lane, items.filter(item => todoLane(item.todo, item.group) === lane)])) as Record<WorkBoardLane, WorkBoardItem[]>;
  const occupied = lanes.filter(lane => rows[lane].length);
  const recent = preferences.recent.filter(lane => occupied.includes(lane) || (openedEmpty?.filterKey === filterKey && openedEmpty.lane === lane));
  const layout = workBoardLayout(width, lanes, occupied, { ...preferences, recent });
  const toggle = (lane: WorkBoardLane) => {
    const closing = layout.expanded.includes(lane);
    if (closing && layout.expanded.length === 1) return;
    if (!closing && !rows[lane].length) setOpenedEmpty({ filterKey, lane });
    const next = { closed: closing ? [...preferences.closed, lane] : preferences.closed.filter(key => key !== lane), recent: closing ? preferences.recent.filter(key => key !== lane) : [lane, ...preferences.recent.filter(key => key !== lane)] };
    setPreferences(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage may be unavailable in private desktop profiles. */ }
  };
  return <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-3 pt-1 pb-4 md:px-5">
    <div ref={ref} data-work-columns aria-label={t("workBoard.columns")} className="botdom-board-columns grid h-full min-h-0 min-w-0 overflow-hidden" style={{ gridTemplateColumns: layout.columns, gap: layout.gap }}>
      {lanes.map(lane => {
        const open = layout.expanded.includes(lane);
        const onlyOpen = open && layout.expanded.length === 1;
        const label = t(`workBoard.lane.${lane}`);
        const limit = limits[lane] ?? 30;
        return <section key={lane} data-work-lane={lane} data-collapsed={!open || undefined} data-only-open={onlyOpen || undefined} aria-label={label} className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
          <h2 className="h-10 shrink-0 text-[12px] font-normal">
            <button type="button" data-lane-toggle={lane} aria-expanded={open} aria-controls={`work-lane-${lane}`} aria-disabled={onlyOpen || undefined} aria-label={t(open ? "workBoard.collapseLane" : "workBoard.expandLane", { lane: label })} title={onlyOpen ? t("workBoard.keepOne") : t(open ? "workBoard.collapseLane" : "workBoard.expandLane", { lane: label })} onClick={() => toggle(lane)} className={cn("botdom-board-toggle group absolute inset-x-0 top-0 z-10 w-full text-ink-secondary transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent", open ? onlyOpen ? "h-9 cursor-default" : "h-9 rounded-md hover:bg-control/25" : "h-full rounded-lg border-l border-hairline/25 hover:bg-accent/[0.04]")}>
              <span aria-hidden="true" className="botdom-board-heading absolute inset-x-0 top-0 flex h-9 items-center gap-2 px-2">
              <span className={cn("size-1.5 shrink-0 rounded-full", TONE[lane])} aria-hidden="true" />
              <span className="min-w-0 truncate text-ink">{label}</span>
              <span className="rounded bg-control/40 px-1.5 text-[10px] leading-[18px] tabular-nums text-ink-secondary">{rows[lane].length}</span>
              <ChevronLeft size={12} className={cn("ml-auto shrink-0 text-ink-tertiary group-hover:text-ink-secondary", onlyOpen && "invisible")} />
              </span>
              <span aria-hidden="true" className="botdom-board-rail absolute inset-x-0 top-0 flex flex-col items-center gap-2.5 py-3"><span className={cn("size-1.5 shrink-0 rounded-full", TONE[lane])} /><span className="whitespace-nowrap text-ink-secondary [writing-mode:vertical-rl]">{label}</span><span className="text-[11px] tabular-nums text-ink-tertiary">{rows[lane].length}</span><ChevronRight size={12} className="text-ink-tertiary" /></span>
              <span className="sr-only">{label} · {rows[lane].length}</span>
            </button>
          </h2>
          <div id={`work-lane-${lane}`} inert={!open} aria-hidden={!open || undefined} className={cn("botdom-board-content min-h-0 scroll-pt-1 overflow-x-hidden overscroll-contain px-1 pt-1 pb-2", open ? "overflow-y-auto" : "overflow-y-hidden")}>
            <div className="flex min-w-0 flex-col gap-2.5">{rows[lane].slice(0, limit).map(renderCard)}</div>
            {!rows[lane].length && <p className="px-2 py-6 text-center text-[12px] text-ink-tertiary">{t("workBoard.emptyLane")}</p>}
            {rows[lane].length > limit && <button type="button" onClick={() => setLimits(current => ({ ...current, [lane]: limit + 30 }))} className="mt-2 w-full rounded-lg px-2 py-2 text-[12px] text-accent hover:bg-control">{t("workBoard.more", { count: rows[lane].length - limit })}</button>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
