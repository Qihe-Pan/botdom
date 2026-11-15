import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useMenuMotion } from "./MenuMotion";
import "./work-board.css";

export interface WorkBoardSelectOption { value: string; label: string; disabled?: boolean }

export function WorkBoardSelect({ label, value, options, onChange, disabled = false, variant = "filter" }: { label: string; value: string; options: WorkBoardSelectOption[]; onChange: (value: string) => void; disabled?: boolean; variant?: "filter" | "field" | "compact" }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 12, top: 12, width: 240, maxHeight: 320 });
  const motion = useMenuMotion(open);
  const current = options.find(option => option.value === value) ?? options[0];
  const searchable = options.length > 6;
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); };
  const choose = (option: WorkBoardSelectOption) => { if (disabled || option.disabled) return; onChange(option.value); close(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 12;
      const height = Math.min(320, Math.max(80, below, rect.top - 12));
      const actualHeight = Math.min(height, popup.current?.scrollHeight || height);
      setPosition({ width, maxHeight: height, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: below >= actualHeight ? rect.bottom + 5 : Math.max(12, rect.top - actualHeight - 5) });
    };
    place();
    const first = popup.current?.querySelector<HTMLElement>('input, [aria-selected="true"]:not(:disabled)') ?? popup.current?.querySelector<HTMLElement>('[role="option"]:not(:disabled)');
    first?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [open]);
  return <div className={cn("min-w-0", variant === "filter" && "botdom-board-filter")}>
    <button ref={trigger} type="button" disabled={disabled} aria-label={label} title={`${label}：${current?.label ?? ""}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={motion.shown ? id : undefined}
      onClick={() => { setQuery(""); setOpen(value => !value); }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setQuery(""); setOpen(true); } }}
      className={cn("botdom-board-select flex w-full min-w-0 items-center gap-2 rounded-lg border bg-menu text-ink transition-colors disabled:opacity-40", variant === "field" ? "h-9 px-3 text-[13px]" : variant === "compact" ? "h-6 px-2 text-[11px]" : "h-8 px-2.5 text-[12px]", open ? "border-ink-secondary/60" : "border-hairline/40 hover:border-ink-secondary/50")}>
      <span className="min-w-0 flex-1 truncate text-left">{current?.label}</span><ChevronDown size={12} aria-hidden="true" className={cn("shrink-0 text-ink-secondary transition-transform motion-reduce:transition-none", open && "rotate-180")} />
    </button>
    {motion.shown && createPortal(<div ref={popup} {...motion.exitProps} style={{ ...position, position: "fixed" }} className={cn("botdom-board-menu z-[100] flex flex-col overflow-hidden rounded-lg border border-hairline/60 bg-menu p-1 text-ink shadow-[0_8px_28px_rgb(0_0_0/0.12)]", motion.className)} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === "Tab") { close(); return; }
      const buttons = [...popup.current!.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')];
      const searching = event.target instanceof HTMLInputElement;
      if (searching && event.key === "Enter") { event.preventDefault(); const first = filtered.find(option => !option.disabled); if (first) choose(first); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || (searching && ["Home", "End"].includes(event.key))) return;
      event.preventDefault();
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : index < 0 ? event.key === "ArrowUp" ? buttons.length - 1 : 0 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus(); buttons[next].scrollIntoView?.({ block: "nearest" });
    }}>
      {searchable && <label className="m-1 mb-2 flex shrink-0 items-center gap-2 rounded-md bg-control/40 px-2 py-1.5"><Search size={13} aria-hidden="true" className="shrink-0 text-ink-secondary" /><input aria-label={t("p0.choice.search")} placeholder={t("p0.choice.search")} value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" /></label>}
      <div id={id} role="listbox" aria-label={label} className="min-h-0 overflow-y-auto overscroll-contain">
        {filtered.map(option => <button key={option.value} type="button" role="option" disabled={option.disabled} aria-selected={option.value === value} onClick={() => choose(option)} className="flex min-h-8 w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] leading-5 hover:bg-control/50 focus:bg-control/50 disabled:opacity-35 disabled:hover:bg-transparent">
          <span className="min-w-0 flex-1 break-words">{option.label}</span><Check size={13} aria-hidden="true" className={cn("shrink-0 text-ink-secondary", option.value !== value && "invisible")} />
        </button>)}
        {!filtered.length && <p role="status" className="px-2.5 py-3 text-[12px] text-ink-secondary">{t("p0.choice.empty")}</p>}
      </div>
    </div>, document.body)}
  </div>;
}
