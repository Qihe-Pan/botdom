import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A source-run server has no desktop parent to hand it the owner capability, so the desktop window that attaches to it
 * reads the capability from this private file. Without it every local process, a bot's shell included, is the owner. */
export function attachedOwnerToken(file: string): string {
  try {
    const saved = readFileSync(file, "utf8").trim();
    if (TOKEN.test(saved)) { chmodSync(file, 0o600); return saved; }
  } catch {}
  const token = randomBytes(32).toString("base64url");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}
