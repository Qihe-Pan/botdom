export const FONT_IDS = ["code", "rounded", "handwritten", "pen", "cute", "kai", "system", "skin", "inter", "poppins", "serif", "custom"] as const;
export type FontId = (typeof FONT_IDS)[number];

/** The skin's own font: no attribute on the root, so each skin's stylesheet decides. */
export const SKIN_FONT: FontId = "skin";
export const DEFAULT_FONT: FontId = "system";
export const CUSTOM_FONT_MAX = 60;

const KEY = "omb-font";
const CUSTOM_KEY = "omb-font-custom";
/** Set once the person picks a font; a value stored before that was only a startup default. */
const CHOSEN_KEY = "omb-font-chosen";

function isFontId(value: unknown): value is FontId {
  return FONT_IDS.includes(value as FontId);
}

function getStore(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readFont(): FontId {
  try {
    const store = getStore();
    const stored = store?.getItem(KEY);
    if (!isFontId(stored)) return DEFAULT_FONT;
    return stored === "code" && store?.getItem(CHOSEN_KEY) !== "1" ? DEFAULT_FONT : stored;
  } catch {
    return DEFAULT_FONT;
  }
}

/** A family name a person typed, reduced to something a CSS font-family can hold without escaping its declaration. */
export function cleanFontName(value: string): string {
  return value.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trim().slice(0, CUSTOM_FONT_MAX);
}

export function readCustomFont(): string {
  try {
    return cleanFontName(getStore()?.getItem(CUSTOM_KEY) ?? "");
  } catch {
    return "";
  }
}

/** Shows a font without remembering it; startup uses this so a default is never mistaken for a choice. */
export function applyFont(id: FontId, custom = readCustomFont()): void {
  showFont(id, custom);
}

/** The person picked this font: show it and keep it on this computer. */
export function chooseFont(id: FontId, custom = readCustomFont()): void {
  const name = showFont(id, custom);
  try {
    const store = getStore();
    store?.setItem(KEY, id);
    store?.setItem(CHOSEN_KEY, "1");
    if (id === "custom") store?.setItem(CUSTOM_KEY, name);
  } catch {
  }
}

function showFont(id: FontId, custom: string): string {
  const root = document.documentElement;
  const name = cleanFontName(custom);
  if (id === SKIN_FONT || (id === "custom" && !name)) delete root.dataset.font;
  else root.dataset.font = id;
  if (id === "custom" && name) root.style?.setProperty("--font-custom", `"${name}"`);
  else root.style?.removeProperty("--font-custom");
  return name;
}
