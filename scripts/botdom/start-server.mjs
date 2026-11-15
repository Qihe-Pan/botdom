import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.OMB_PORT ??= "8820";
process.env.OMB_DATA_DIR ??= join(homedir(), ".botdom-next");
process.env.OMB_STATIC_DIR = fileURLToPath(new URL("../../dist/", import.meta.url));
await import("../../server/dev-server.ts");
