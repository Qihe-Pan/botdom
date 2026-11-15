import { Children, isValidElement, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

type Option = { value: string; label: string; disabled: boolean };
type Props = Omit<ComponentProps<"select">, "onChange" | "size" | "value" | "multiple"> & {
  value?: string | number;
  onChange?: (event: { target: { value: string }; currentTarget: { value: string } }) => void;
  size?: "sm" | "md" | "lg";
  variant?: "field" | "pill" | "ghost" | "quiet";
  searchable?: boolean;
  forceDropdown?: boolean;
  tone?: "accent" | "neutral";
};
const textOf = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : String(child)).join("");
function optionsOf(children: ReactNode, disabled = false): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)) return [];
    const label = textOf(child.props.children);
    return child.type === "option"
      ? [{ value: String(child.props.value ?? label), label, disabled: disabled || Boolean(child.props.disabled) }]
      : optionsOf(child.props.children, disabled || Boolean(child.props.disabled));
  });
}

export function ChoiceSelect({ children, value = "", onChange, disabled, className, id, title, searchable, forceDropdown = false, tone = "accent", "aria-label": label, "aria-labelledby": labelledBy }: Props) {
  const options = optionsOf(children);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280, maxHeight: 300 });
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const search = searchable === true || (searchable !== false && options.length > 5);
  const current = options.find(option => option.value === String(value));
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const choose = (option: Option) => {
    if (disabled || option.disabled) return;
    onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } });
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 16;
      const height = Math.min(320, popup.current?.scrollHeight || 320, Math.max(below, rect.top - 16));
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: below >= height ? rect.bottom + 4 : Math.max(12, rect.top - height - 4), width, maxHeight: height });
    };
    place();
    const initial = popup.current?.querySelector<HTMLElement>("input")
      ?? popup.current?.querySelector<HTMLElement>("[role=option][aria-selected=true]:not(:disabled)")
      ?? popup.current?.querySelector<HTMLElement>("[role=option]:not(:disabled)");
    initial?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const pill = "rounded-full border px-3 py-1.5 text-[13px] font-normal transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";
  if (!search && !forceDropdown) return <div ref={root} id={id} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} title={title} className={cn("flex min-w-0 flex-wrap", tone === "neutral" ? "gap-0.5 rounded-xl bg-ink/[0.035] p-1" : "gap-1.5", className)}
    onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const enabled = options.filter(option => !disabled && !option.disabled);
      if (!enabled.length) return;
      event.preventDefault();
      const index = enabled.findIndex(option => option.value === String(value));
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length;
      choose(enabled[next]);
      root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")[next]?.focus();
    }}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === String(value)} disabled={disabled || option.disabled}
      tabIndex={option.value === (options.find(item => item.value === String(value) && !item.disabled)?.value ?? options.find(item => !item.disabled)?.value) ? 0 : -1}
      onClick={() => choose(option)} className={cn(tone === "neutral"
        ? "rounded-lg px-3 py-1.5 text-[13px] font-normal transition-colors focus-visible:outline-2 focus-visible:outline-ink/50 disabled:opacity-40"
        : pill, tone === "neutral"
        ? option.value === String(value) ? "bg-ink/[0.10] text-ink" : "text-ink-secondary hover:bg-ink/[0.06] hover:text-ink"
        : option.value === String(value) ? "border-accent/45 bg-accent/[0.08] text-ink" : "border-hairline/60 bg-app text-ink-secondary hover:border-ink/30 hover:text-ink")}>{option.label}</button>)}
  </div>;
  return <div ref={root} className={cn("inline-flex min-w-0", className)}>
    <button ref={trigger} id={id} type="button" aria-label={label} aria-labelledby={labelledBy} title={title} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} disabled={disabled}
      onClick={() => { setQuery(""); setOpen(!open); }} className="flex min-w-0 items-center gap-2 rounded-lg border border-hairline/40 bg-control/50 px-3 py-1.5 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40">
      <span className="truncate">{current?.label ?? String(value)}</span><ChevronDown size={13} className="shrink-0 text-ink-secondary" />
    </button>
    {open && !disabled && createPortal(<div ref={popup} data-choice-select-popup={listId} role="dialog" aria-label={label ?? t("p0.choice.search")} style={{ ...position, position: "fixed" }}
      className="popover-surface z-[100] flex flex-col overflow-hidden rounded-xl border border-hairline bg-menu p-2 text-ink shadow-xl"
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        if (event.key === "Tab") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const buttons = [...popup.current!.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
      {search && <div className="mb-1 flex items-center gap-2 rounded-lg bg-control px-2 py-1.5"><Search size={14} className="shrink-0 text-ink-secondary" />
        <input value={query} onChange={event => setQuery(event.target.value)} aria-label={t("p0.choice.search")} placeholder={t("p0.choice.search")}
          onKeyDown={event => { if (event.key === "Enter") { const first = filtered.find(option => !option.disabled); if (first) { event.preventDefault(); choose(first); } } }}
          className="w-full min-w-0 bg-transparent text-[13px] outline-none" />
      </div>}
      <div id={listId} role="listbox" aria-label={label} className="min-h-0 overflow-y-auto">
        {filtered.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === String(value)} disabled={option.disabled}
          onClick={() => choose(option)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-control focus:bg-control focus:outline-none disabled:opacity-40">
          <span className="min-w-0 flex-1 break-words">{option.label}</span>{option.value === String(value) && <Check size={14} className="shrink-0 text-accent" />}
        </button>)}
        {!filtered.length && <p className="p-2 text-[13px] text-ink-secondary">{t("p0.choice.empty")}</p>}
      </div>
    </div>, document.body)}
  </div>;
}
