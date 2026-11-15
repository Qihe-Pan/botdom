import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { personKey } from "./person-key.ts";
import type { BotRecord } from "./store.ts";

const id = z.string().min(1).max(512);
const ledgerSchema = z.object({ v: z.literal(1), places: z.record(z.string(), id) });
const homeSchema = z.object({ botId: id, threadId: id });
const inboxSchema = z.object({ version: z.literal(1), homes: z.record(z.string(), homeSchema),
  items: z.array(homeSchema.extend({ person: z.string() })) });
const accessSchema = z.object({ everyone: z.literal("none"), people: z.record(z.string(), z.enum(["view", "chat", "edit"])) });
const startersSchema = z.record(z.string(), z.string());

function read(path: string): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? undefined : null; }
}

type Recovery = { state: "new" } | { state: "blocked" } | { state: "restore"; bot: BotRecord };

export function personalBotRecovery(bots: readonly BotRecord[], dataDir: string, person: string): Recovery {
  const key = personKey({ id: "", email: person });
  const ledgerRaw = read(join(dataDir, "default-bot.json"));
  const inboxRaw = read(join(dataDir, "person-inbox.json"));
  const ledger = ledgerSchema.safeParse(ledgerRaw);
  const inbox = inboxSchema.safeParse(inboxRaw);
  if ((ledgerRaw !== undefined && !ledger.success) || (inboxRaw !== undefined && !inbox.success)) return { state: "blocked" };
  const botId = ledger.success ? ledger.data.places[person] : undefined;
  const home = inbox.success ? inbox.data.homes[key] : undefined;
  if (!botId) {
    const privateBot = bots.some((bot) => bot.visibility && typeof bot.visibility === "object" && Array.isArray(bot.visibility.people) && bot.visibility.people.includes(person));
    return home || privateBot ? { state: "blocked" } : { state: "new" };
  }
  if (!home || home.botId !== botId || !ledger.success || !inbox.success) return { state: "blocked" };
  if (Object.entries(ledger.data.places).some(([owner, id]) => owner !== person && id === botId)) return { state: "blocked" };
  if (Object.entries(inbox.data.homes).some(([owner, at]) => owner !== key && (at.botId === botId || at.threadId === home.threadId))) return { state: "blocked" };
  if (inbox.data.items.some((item) => (item.person === key || item.botId === botId || item.threadId === home.threadId)
    && (item.person !== key || item.botId !== botId || item.threadId !== home.threadId))) return { state: "blocked" };
  const matches = bots.filter((bot) => bot.id === botId);
  const bot = matches[0];
  if (matches.length !== 1 || !bot || bot.defaultBot || bot.hidden || bot.movedTo || bot.supervisorGroupId || bot.section) return { state: "blocked" };
  if (!bot.visibility || typeof bot.visibility !== "object" || !Array.isArray(bot.visibility.people) || bot.visibility.people.length !== 1 || bot.visibility.people[0] !== person) return { state: "blocked" };
  if ([bot.createdBy, bot.reportsTo].some((owner) => owner && owner.trim().toLowerCase() !== person)) return { state: "blocked" };
  if (bot.access !== undefined) {
    const access = accessSchema.safeParse(bot.access);
    if (!access.success || Object.keys(access.data.people).some((owner) => owner !== person)) return { state: "blocked" };
  }
  const tasks = bot.tasks?.filter((task) => task.threadId === home.threadId) ?? [];
  const task = tasks[0];
  if (tasks.length !== 1 || !task || task.archivedAt !== undefined || task.routineRunId || task.openedBy) return { state: "blocked" };
  if (bots.some((other) => other.id !== botId && (other.threadId === home.threadId || other.tasks?.some((task) => task.threadId === home.threadId)))) return { state: "blocked" };
  const starters = startersSchema.safeParse(read(join(dataDir, "thread-starters.json")));
  if (!starters.success || starters.data[home.threadId] !== key) return { state: "blocked" };
  return { state: "restore", bot };
}
