import { app } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";

app.setName("Botdom Next");
app.setPath("userData", join(homedir(), "Library", "Application Support", "Botdom Next"));
process.env.OMB_DATA_DIR = join(homedir(), ".botdom-next");
process.env.OMB_PORT = "8820";
process.env.ELECTRON_START_URL = `http://127.0.0.1:${process.env.OMB_PORT}`;
await import("../../electron/main.mjs");
