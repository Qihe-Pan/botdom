// White-label: a brand.json next to the data dir, applied only with the `whitelabel` entitlement (an unlicensed server
// reports what it found and keeps the default). Read on every request, so an edit shows on the next reload.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { DATA_DIR } from "./config.ts";
import { entitled } from "./enterprise.ts";

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_CHARS = 300_000;
const MAX_FAVICON_CHARS = 120_000;

export const brandSchema = z
  .object({
    /** Product name shown in the window title, onboarding and settings. */
    name: z.string().trim().min(1, "name must not be empty").max(40, "name must be 40 characters or fewer"),
    /** One line under the name on the welcome screen. */
    tagline: z.string().trim().max(120, "tagline must be 120 characters or fewer").optional(),
    /** Accent colour for buttons, links and focus rings; text on it is derived for contrast. */
    accent: z.string().regex(HEX_COLOUR, "accent must be a 6-digit hex colour such as #C2510A").optional(),
    /** Welcome-screen mark: an inline data:image/... URI or an https:// URL. */
    logo: z
      .string()
      .max(MAX_LOGO_CHARS, `logo must be under ${MAX_LOGO_CHARS} characters (inline a small SVG or link an https:// image)`)
      .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "logo must be a data:image/... URI or an https:// URL")
      .optional(),
    /** Where "get help" points for this deployment. */
    supportUrl: z.string().url().startsWith("https://", "supportUrl must be an https:// URL").optional(),
    /** Tab and home-screen icon: an inline data:image/... URI (PNG or SVG, small) or an https:// URL. */
    favicon: z
      .string()
      .max(MAX_FAVICON_CHARS, `favicon must be under ${MAX_FAVICON_CHARS} characters (a 64px PNG or a small SVG)`)
      .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "favicon must be a data:image/... URI or an https:// URL")
      .optional(),
  })
  .strict();

export type Brand = z.infer<typeof brandSchema>;

export const DEFAULT_BRAND: Brand = { name: "Botdom", accent: "#6E52C0", logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJCb3Rkb20iPgogIDxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE1IiBmaWxsPSIjMmUwNzVhIi8+CiAgPHBhdGggZD0iTTIzIDEyLjQgMjIgNy4yYy0uMi0uOS44LTEuNCAxLjUtLjhsMy4yIDIuMSA0LjEtNS4xYy42LS43IDEuOC0uNyAyLjQgMGw0LjEgNS4xIDMuMi0yLjFjLjctLjYgMS43LS4xIDEuNS44bC0xIDUuMmMtLjEuNi0uNiAxLTEuMiAxSDI0LjJjLS42IDAtMS4xLS40LTEuMi0xWiIgZmlsbD0iI2ZmY2EyZSIvPgogIDxyZWN0IHg9IjE4IiB5PSIxNSIgd2lkdGg9IjI4IiBoZWlnaHQ9IjIzIiByeD0iOCIgZmlsbD0iI2Q4YjdmNSIvPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjI3IiBjeT0iMjgiIHI9IjEuOSIvPjxjaXJjbGUgY3g9IjM3IiBjeT0iMjgiIHI9IjEuOSIvPjwvZz4KICA8Zz48cmVjdCB4PSI1LjUiIHk9IjM0IiB3aWR0aD0iMTUiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKC0xMiAxMyA0MSkiIGZpbGw9IiNiOWYyZDMiLz48cmVjdCB4PSI0My41IiB5PSIzNCIgd2lkdGg9IjE1IiBoZWlnaHQ9IjE0IiByeD0iNi41IiB0cmFuc2Zvcm09InJvdGF0ZSgxMiA1MSA0MSkiIGZpbGw9IiNmZmQwYjQiLz48cmVjdCB4PSIxNSIgeT0iNDQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNCIgcng9IjYuNSIgdHJhbnNmb3JtPSJyb3RhdGUoLTkgMjMgNTEpIiBmaWxsPSIjY2JlM2ZhIi8+PHJlY3QgeD0iMzMiIHk9IjQ0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKDkgNDEgNTEpIiBmaWxsPSIjZjhjNWQ5Ii8+PC9nPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjExLjciIGN5PSIzOC4zIiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iMTUiIGN5PSIzNi44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDguNyIgY3k9IjM2LjgiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSI1MiIgY3k9IjM4LjMiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjQ4LjIiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyNS40IiBjeT0iNDYuOCIgcj0iMS4yNSIvPjxjaXJjbGUgY3g9IjM4LjYiIGN5PSI0Ni44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDIiIGN5PSI0OC4yIiByPSIxLjI1Ii8+PC9nPgo8L3N2Zz4K", favicon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJCb3Rkb20iPgogIDxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE1IiBmaWxsPSIjMmUwNzVhIi8+CiAgPHBhdGggZD0iTTIzIDEyLjQgMjIgNy4yYy0uMi0uOS44LTEuNCAxLjUtLjhsMy4yIDIuMSA0LjEtNS4xYy42LS43IDEuOC0uNyAyLjQgMGw0LjEgNS4xIDMuMi0yLjFjLjctLjYgMS43LS4xIDEuNS44bC0xIDUuMmMtLjEuNi0uNiAxLTEuMiAxSDI0LjJjLS42IDAtMS4xLS40LTEuMi0xWiIgZmlsbD0iI2ZmY2EyZSIvPgogIDxyZWN0IHg9IjE4IiB5PSIxNSIgd2lkdGg9IjI4IiBoZWlnaHQ9IjIzIiByeD0iOCIgZmlsbD0iI2Q4YjdmNSIvPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjI3IiBjeT0iMjgiIHI9IjEuOSIvPjxjaXJjbGUgY3g9IjM3IiBjeT0iMjgiIHI9IjEuOSIvPjwvZz4KICA8Zz48cmVjdCB4PSI1LjUiIHk9IjM0IiB3aWR0aD0iMTUiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKC0xMiAxMyA0MSkiIGZpbGw9IiNiOWYyZDMiLz48cmVjdCB4PSI0My41IiB5PSIzNCIgd2lkdGg9IjE1IiBoZWlnaHQ9IjE0IiByeD0iNi41IiB0cmFuc2Zvcm09InJvdGF0ZSgxMiA1MSA0MSkiIGZpbGw9IiNmZmQwYjQiLz48cmVjdCB4PSIxNSIgeT0iNDQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNCIgcng9IjYuNSIgdHJhbnNmb3JtPSJyb3RhdGUoLTkgMjMgNTEpIiBmaWxsPSIjY2JlM2ZhIi8+PHJlY3QgeD0iMzMiIHk9IjQ0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTQiIHJ4PSI2LjUiIHRyYW5zZm9ybT0icm90YXRlKDkgNDEgNTEpIiBmaWxsPSIjZjhjNWQ5Ii8+PC9nPgogIDxnIGZpbGw9IiMyZTA3NWEiPjxjaXJjbGUgY3g9IjExLjciIGN5PSIzOC4zIiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iMTUiIGN5PSIzNi44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDguNyIgY3k9IjM2LjgiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSI1MiIgY3k9IjM4LjMiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjQ4LjIiIHI9IjEuMjUiLz48Y2lyY2xlIGN4PSIyNS40IiBjeT0iNDYuOCIgcj0iMS4yNSIvPjxjaXJjbGUgY3g9IjM4LjYiIGN5PSI0Ni44IiByPSIxLjI1Ii8+PGNpcmNsZSBjeD0iNDIiIGN5PSI0OC4yIiByPSIxLjI1Ii8+PC9nPgo8L3N2Zz4K" };

export interface BrandStatus {
  brand: Brand;
  /** "file" when brand.json is applied; "default" otherwise (see notice for why). */
  source: "default" | "file";
  /** The path consulted, so an operator knows where to put the file. */
  file: string;
  /** Why the file was not applied, in terms of what to change. */
  notice?: string;
}

export function brandFile(): string {
  return process.env.OMB_BRAND_FILE || join(DATA_DIR, "brand.json");
}

/** Never throws. */
export function loadBrand(options: { file?: string; isEntitled?: (feature: string) => boolean } = {}): BrandStatus {
  const file = options.file ?? brandFile();
  const isEntitled = options.isEntitled ?? entitled;
  const fallback = (notice?: string): BrandStatus =>
    notice ? { brand: DEFAULT_BRAND, source: "default", file, notice } : { brand: DEFAULT_BRAND, source: "default", file };
  if (!existsSync(file)) return fallback();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fallback(`${file} is not valid JSON (${error instanceof Error ? error.message : String(error)}); using the default brand`);
  }
  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return fallback(`${file}: ${where}${issue?.message ?? "invalid"}; using the default brand`);
  }
  if (!isEntitled("whitelabel")) {
    return fallback(`${file} found but this server is not licensed for whitelabel; using the default brand`);
  }
  return { brand: parsed.data, source: "file", file };
}

export function describeBrand(status: BrandStatus): string {
  if (status.source === "file") return `brand: ${status.brand.name} (from ${status.file})`;
  return `brand: default${status.notice ? ` (${status.notice})` : ""}`;
}
