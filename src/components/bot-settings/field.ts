import { createElement, type ReactNode } from "react";

export const inputCls =
  "w-full rounded-xl border border-hairline/50 bg-panel px-3 py-2 text-[14px] text-ink transition-colors placeholder:text-ink-tertiary hover:border-ink/20 focus:border-ink/40 focus:bg-card focus:outline-none";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return createElement(
    "label",
    { className: "block" },
    createElement("div", { className: "mb-1.5 text-[13px] text-ink-secondary" }, label),
    children,
  );
}
