import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useComputerPanelResize } from "./computer-panel-resize";

export function PanelResizeEdge({ resize, label }: { resize: ReturnType<typeof useComputerPanelResize>; label?: string }) {
  return <div
    ref={resize.separatorRef}
    role="separator"
    aria-orientation="vertical"
    aria-label={label ?? t("panel.resize")}
    aria-valuemin={resize.minWidth}
    aria-valuemax={resize.maxWidth}
    aria-valuenow={resize.separatorWidth || resize.panelWidth}
    tabIndex={0}
    title={t("panel.resizeHint")}
    onDoubleClick={resize.resetWidth}
    data-resizing={resize.resizing || undefined}
    onLostPointerCapture={resize.onResizeEnd}
    onKeyDown={resize.onSeparatorKeyDown}
    onPointerDown={resize.onResizeStart}
    onPointerMove={resize.onResizeMove}
    onPointerUp={resize.onResizeEnd}
    onPointerCancel={resize.onResizeEnd}
    className="group/edge absolute inset-y-0 left-0 z-10 w-2.5 cursor-col-resize touch-none focus-visible:outline-none max-md:hidden"
  >
    <span aria-hidden="true" className={cn("pointer-events-none absolute inset-y-4 left-0 w-px rounded-full bg-accent/0 transition-colors duration-150 motion-reduce:transition-none",
      "group-hover/edge:bg-accent/35 group-focus-visible/edge:bg-accent/50", resize.resizing && "bg-accent/60")} />
    <span aria-hidden="true" className={cn("pointer-events-none absolute left-[-1.5px] top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-accent/0 transition-colors duration-150 motion-reduce:transition-none",
      "group-hover/edge:bg-accent/60 group-focus-visible/edge:bg-accent/70", resize.resizing && "bg-accent")} />
    {resize.resizing && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-14 whitespace-nowrap rounded-md bg-accent px-2 py-1 text-[11px] tabular-nums text-white shadow-sm">{Math.round(resize.panelWidth)} px</span>}
  </div>;
}
