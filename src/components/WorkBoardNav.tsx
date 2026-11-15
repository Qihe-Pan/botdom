import { Columns3 } from "lucide-react";
import { useStore } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export function WorkBoardNav({ compact, onOpen }: { compact?: boolean; onOpen?: () => void }) {
  const { state, dispatch } = useStore();
  return <button type="button" aria-label={t("workBoard.title")} title={compact ? t("workBoard.title") : undefined} aria-pressed={state.activeView === "work-board"}
    onClick={() => { dispatch({ type: "showWorkBoard" }); onOpen?.(); }}
    className={cn("relative flex shrink-0 items-center gap-2.5 rounded-lg text-[13px] transition-colors hover:bg-control/50 focus-visible:outline-2 focus-visible:outline-ink-secondary", compact ? "mx-auto my-1.5 size-8 justify-center" : "mx-2 my-1.5 h-8 px-3 text-left", state.activeView === "work-board" ? "bg-control/50 text-ink" : "text-ink-secondary")}>
    {state.activeView === "work-board" && !compact && <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-ink-secondary/70" />}<Columns3 size={16} strokeWidth={1.5} aria-hidden="true" />{!compact && <span>{t("workBoard.title")}</span>}
  </button>;
}
