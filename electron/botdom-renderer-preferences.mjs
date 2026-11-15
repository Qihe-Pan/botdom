import { WebContentsView } from "electron";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const previousOrigin = "http://127.0.0.1:5220";
const currentOrigin = "http://127.0.0.1:8820";
const preferences = [
  "omb-font", "omb-font-chosen", "omb-font-custom", "omb-skin", "omb-language", "omb-advanced-mode",
  "omb-color-user-bubbles", "omb-send-key", "omb-chat-width", "omb-computer-panel-width", "omb-computer-panel-view",
  "omb-drafts", "omb-draft-attachments", "omb-draft-send-ids", "omb-draft-channel-modes",
  "openmausbot.lastConversation.v1", "openmausbot.lastBotSection.v1", "openmausbot.pinnedCircles",
  "openmausbot.universalPins", "openmausbot.pinnedCircleOrder.v1", "botdom.work-board.columns.v1",
  "botdom.taskBoardWidth", "botdom.roomPanelWidth", "botdom.botPanelWidth", "botdom.tableDialogWidth",
  "botdom.documentReaderWidth", "botdom.webPreviewWidth", "omb.onboarding.welcomeFinished",
  "omb.onboarding.welcomeDraft", "omb.onboarding.sharedWorkspaceHint", "omb-webhook-credentials",
];
const prefixes = ["openmausbot.sidebar", "botdom.sidebarRoom", "botdom.room-queue.v1:", "botdom.room-interjection.v1:"];

export async function migrateBotdomRendererPreferences(userData) {
  const marker = join(userData, "renderer-origin-8820.done");
  if (existsSync(marker)) return;
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const page = view.webContents;
  // Chromium keys local storage by origin. Inline, script-free pages select each storage area without contacting a listener.
  const openStorage = (origin) => page.loadURL("data:text/html,<meta charset=utf-8>", { baseURLForDataURL: origin + "/" });
  try {
    await openStorage(previousOrigin);
    const keys = await page.executeJavaScript("Object.keys(localStorage)");
    const wanted = keys.filter(key => preferences.includes(key) || prefixes.some(prefix => key.startsWith(prefix)));
    if (wanted.length) {
      const entries = await page.executeJavaScript(`${JSON.stringify(wanted)}.map(key => [key, localStorage.getItem(key)])`);
      await openStorage(currentOrigin);
      await page.executeJavaScript(`for (const [key, value] of ${JSON.stringify(entries)}) {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      }`);
      page.session.flushStorageData();
    }
    writeFileSync(marker, "");
  } finally {
    page.close();
  }
}
