export interface Brand {
  name: string;
  tagline?: string;
  accent?: string;
  logo?: string;
  favicon?: string;
  supportUrl?: string;
}

export interface BrandStatus {
  brand: Brand;
  source: "default" | "file";
  file: string;
  notice?: string;
}

export const DEFAULT_BRAND: Brand = { name: "Botdom", accent: "#6E52C0", logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJCb3Rkb20iPgogIDxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE1IiBmaWxsPSIjMmUwNzVhIi8+CiAgPHBhdGggZD0iTTIzIDEyLjQgMjIgNy4yYy0uMi0uOS44LTEuNCAxLjUtLjhsMy4yIDIuMSA0LjEtNS4xYy42LS43IDEuOC0uNyAyLjQgMGw0LjEgNS4xIDMuMi0yLjFjLjctLjYgMS43LS4xIDEuNS44bC0xIDUuMmMtLjEuNi0uNiAxLTEuMiAxSDI0LjJjLS42IDAtMS4xLS40LTEuMi0xWiIgZmlsbD0iI2ZmY2EyZSIvPgogIDxyZWN0IHg9IjE4IiB5PSIxNSIgd2lkdGg9IjI4IiBoZWlnaHQ9IjIzIiByeD0iOCIgZmlsbD0iI2Q4YjdmNSIvPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjI3IiBjeT0iMjgiIHI9IjEuOSIvPjxjaXJjbGUgY3g9IjM3IiBjeT0iMjgiIHI9IjEuOSIvPjwvZz4KICA8Zz48cmVjdCB4PSI1LjUiIHk9IjM0IiB3aWR0aD0iMTUiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKC0xMiAxMyA0MSkiIGZpbGw9IiNiOWYyZDMiLz48cmVjdCB4PSI0My41IiB5PSIzNCIgd2lkdGg9IjE1IiBoZWlnaHQ9IjE0IiByeD0iNi41IiB0cmFuc2Zvcm09InJvdGF0ZSgxMiA1MSA0MSkiIGZpbGw9IiNmZmQwYjQiLz48cmVjdCB4PSIxNSIgeT0iNDQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNCIgcng9IjYuNSIgdHJhbnNmb3JtPSJyb3RhdGUoLTkgMjMgNTEpIiBmaWxsPSIjY2JlM2ZhIi8+PHJlY3QgeD0iMzMiIHk9IjQ0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKDkgNDEgNTEpIiBmaWxsPSIjZjhjNWQ5Ii8+PC9nPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjExLjciIGN5PSIzOC4zIiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iMTUiIGN5PSIzNi44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDguNyIgY3k9IjM2LjgiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSI1MiIgY3k9IjM4LjMiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjQ4LjIiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyNS40IiBjeT0iNDYuOCIgcj0iMS4yNSIvPjxjaXJjbGUgY3g9IjM4LjYiIGN5PSI0Ni44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDIiIGN5PSI0OC4yIiByPSIxLjI1Ii8+PC9nPgo8L3N2Zz4K", favicon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJCb3Rkb20iPgogIDxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE1IiBmaWxsPSIjMmUwNzVhIi8+CiAgPHBhdGggZD0iTTIzIDEyLjQgMjIgNy4yYy0uMi0uOS44LTEuNCAxLjUtLjhsMy4yIDIuMSA0LjEtNS4xYy42LS43IDEuOC0uNyAyLjQgMGw0LjEgNS4xIDMuMi0yLjFjLjctLjYgMS43LS4xIDEuNS44bC0xIDUuMmMtLjEuNi0uNiAxLTEuMiAxSDI0LjJjLS42IDAtMS4xLS40LTEuMi0xWiIgZmlsbD0iI2ZmY2EyZSIvPgogIDxyZWN0IHg9IjE4IiB5PSIxNSIgd2lkdGg9IjI4IiBoZWlnaHQ9IjIzIiByeD0iOCIgZmlsbD0iI2Q4YjdmNSIvPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjI3IiBjeT0iMjgiIHI9IjEuOSIvPjxjaXJjbGUgY3g9IjM3IiBjeT0iMjgiIHI9IjEuOSIvPjwvZz4KICA8Zz48cmVjdCB4PSI1LjUiIHk9IjM0IiB3aWR0aD0iMTUiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKC0xMiAxMyA0MSkiIGZpbGw9IiNiOWYyZDMiLz48cmVjdCB4PSI0My41IiB5PSIzNCIgd2lkdGg9IjE1IiBoZWlnaHQ9IjE0IiByeD0iNi41IiB0cmFuc2Zvcm09InJvdGF0ZSgxMiA1MSA0MSkiIGZpbGw9IiNmZmQwYjQiLz48cmVjdCB4PSIxNSIgeT0iNDQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNCIgcng9IjYuNSIgdHJhbnNmb3JtPSJyb3RhdGUoLTkgMjMgNTEpIiBmaWxsPSIjY2JlM2ZhIi8+PHJlY3QgeD0iMzMiIHk9IjQ0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKDkgNDEgNTEpIiBmaWxsPSIjZjhjNWQ5Ii8+PC9nPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjExLjciIGN5PSIzOC4zIiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iMTUiIGN5PSIzNi44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDguNyIgY3k9IjM2LjgiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSI1MiIgY3k9IjM4LjMiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjQ4LjIiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyNS40IiBjeT0iNDYuOCIgcj0iMS4yNSIvPjxjaXJjbGUgY3g9IjM4LjYiIGN5PSI0Ni44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDIiIGN5PSI0OC4yIiByPSIxLjI1Ii8+PC9nPgo8L3N2Zz4K" };
/** The product's name wherever a person reads it. OpenMausBot names only the open-source project and its repository. */
export const PRODUCT_NAME = "Botdom";

let current: BrandStatus = { brand: DEFAULT_BRAND, source: "default", file: "" };

export function brand(): Brand {
  return current.brand;
}

/** The name a person reads: a white-label brand file's own name, else MausBot. `brand().name` stays the project's name. */
export function productName(): string {
  return current.source === "file" ? current.brand.name : PRODUCT_NAME;
}

export function brandStatus(): BrandStatus {
  return current;
}

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function luminance(hex: string): number {
  const m = HEX.exec(hex);
  if (!m) return 0;
  const channel = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(m[1]) + 0.7152 * channel(m[2]) + 0.0722 * channel(m[3]);
}

export function accentInk(accent: string): string {
  // contrast vs white = 1.05 / (L + 0.05); vs black = (L + 0.05) / 0.05
  const l = luminance(accent);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

export function brandVars(b: Brand): Record<string, string> {
  if (!b.accent || !HEX.test(b.accent)) return {};
  const [, r, g, blue] = HEX.exec(b.accent)!;
  const channels = [r, g, blue].map((value) => parseInt(value, 16) / 255);
  const [red, green, bChannel] = channels;
  const max = Math.max(...channels), min = Math.min(...channels), delta = max - min;
  const hue = delta === 0 ? 0 : max === red ? (60 * ((green - bChannel) / delta) + 360) % 360
    : max === green ? 60 * ((bChannel - red) / delta + 2) : 60 * ((red - green) / delta + 4);
  if (delta > 0.08 && hue >= 250 && hue < 320) return {};
  return {
    "--color-accent": b.accent,
    "--color-accent-border": b.accent,
    "--color-focus": b.accent,
    "--color-accent-text": b.accent,
    "--color-accent-ink": accentInk(b.accent),
  };
}

export function iconType(href: string): string {
  const match = /^data:(image\/[a-z0-9.+-]+)/i.exec(href);
  return match ? match[1].toLowerCase() : "";
}

let defaultIcon: { href: string; type: string } | null = null;

function applyIcon(favicon: string | undefined): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  defaultIcon ??= { href: link.getAttribute("href") ?? "", type: link.getAttribute("type") ?? "" };
  const next = favicon ? { href: favicon, type: iconType(favicon) } : defaultIcon;
  link.setAttribute("href", next.href);
  if (next.type) link.setAttribute("type", next.type);
  else link.removeAttribute("type");
  let touch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"][data-brand]');
  if (favicon) {
    if (!touch) {
      touch = document.createElement("link");
      touch.rel = "apple-touch-icon";
      touch.dataset.brand = "1";
      document.head.appendChild(touch);
    }
    touch.href = favicon;
  } else touch?.remove();
}

export function applyBrand(status: BrandStatus): void {
  current = status;
  if (typeof document === "undefined") return;
  document.title = productName();
  applyIcon(status.brand.favicon);
  const root = document.documentElement;
  for (const name of ["--color-accent", "--color-accent-border", "--color-focus", "--color-accent-text", "--color-accent-ink"]) {
    root.style.removeProperty(name);
  }
  if (status.source === "file") {
    for (const [name, value] of Object.entries(brandVars(status.brand))) root.style.setProperty(name, value);
  }
}

function isBrandStatus(value: unknown): value is BrandStatus {
  if (!value || typeof value !== "object") return false;
  const v = Reflect.get(value, "brand");
  return Boolean(v) && typeof v === "object" && typeof Reflect.get(Object(v), "name") === "string";
}

export async function bootstrapBrand(fetchImpl: typeof fetch = fetch, timeoutMs = 1500): Promise<BrandStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl("/api/brand", { signal: controller.signal });
    if (!res.ok) return current;
    const body: unknown = await res.json();
    if (isBrandStatus(body)) applyBrand(body);
  } catch {
  } finally {
    clearTimeout(timer);
  }
  return current;
}
