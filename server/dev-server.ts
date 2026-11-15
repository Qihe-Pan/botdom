import { homedir } from "node:os";
import { join } from "node:path";
// `pnpm dev:server`: the harness from a source checkout, whose UI reaches it through Vite's dev proxy in a browser on
// this machine. OMB_DEV_TRUST_LOCAL_BROWSER=0 tries the sign-in a self-hosted server asks a browser for.
process.env.OMB_DEV_TRUST_LOCAL_BROWSER ??= "1";
// Botdom: only the desktop window may change things. Any other local process, a bot's shell included, is refused.
// OMB_DESKTOP_OWNER_TOKEN_FILE= (empty) turns this off for a browser-only checkout.
process.env.OMB_DESKTOP_OWNER_TOKEN_FILE ??= join(homedir(), "Library", "Application Support", "Botdom Next", "desktop-owner-token");
await import("./index.ts");
