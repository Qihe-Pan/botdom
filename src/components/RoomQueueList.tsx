import { t } from "@/lib/i18n";
import { roomActiveMembersLabel, roomExecutionTodo, roomQueuedWorkLabel, roomThreadQueue, roomThreadSpeakerIds } from "@/lib/room-threads";
import { BotAvatar } from "./Avatar";
import { roomMemberState } from "./RoomMemberStrip";
import type { Bot, Group, Message } from "@/state/store";

const nameIn = (members: Bot[]) => (botId: string) => members.find((member) => member.id === botId)?.name;

export function RoomQueueList({ group, members }: { group: Group; members: Bot[] }) {
  const queued = roomThreadQueue(group, group.threadId);
  if (!queued.length) return null;
  const nameOf = nameIn(members);
  return (
    <ul data-testid="room-queue" className="flex flex-col gap-0.5 pl-12 text-[13px] text-ink-secondary">
      {queued.map((entry) => {
        const todo = roomExecutionTodo(group, entry);
        const status = roomQueuedWorkLabel(group, entry, nameOf);
        return <li key={`${entry.threadId}:${entry.botId}:${entry.executionId ?? entry.assignmentId ?? entry.position}:${entry.assignmentId ?? ""}`}
          data-execution-id={entry.executionId} data-assignment-id={entry.assignmentId} data-todo-id={todo?.id}>
          {t("room.queue.member", { name: nameOf(entry.botId) ?? t("sidebar.preview.aBot"), status: todo ? t("room.queue.task", { status, title: todo.title }) : status })}
        </li>;
      })}
    </ul>
  );
}

export function roomMemberQueueTitle(group: Group, members: Bot[], bot: Bot): string | undefined {
  const entry = roomThreadQueue(group, group.threadId).find((candidate) => candidate.botId === bot.id);
  if (!entry) return undefined;
  const todo = roomExecutionTodo(group, entry);
  const status = roomQueuedWorkLabel(group, entry, nameIn(members));
  return t("room.queue.member", { name: bot.name, status: todo ? t("room.queue.task", { status, title: todo.title }) : status });
}

export function RoutedByLine({ routedBy }: { routedBy: NonNullable<Message["routedBy"]> }) {
  const percent = Math.round(Math.min(1, Math.max(0, routedBy.probability)) * 100);
  return (
    <div data-testid="routed-by" className="mt-1 px-1 text-[11px] text-ink-secondary">
      {t(routedBy.provider === "openrouter" ? "room.routedBy.openrouter" : routedBy.provider === "workersai" ? "room.routedBy.workersai" : "room.routedBy", { percent: String(percent) })}
    </div>
  );
}

export function RoomParallelProgress({ group, members }: { group: Group; members: Bot[] }) {
  const ids = roomThreadSpeakerIds(group, group.threadId);
  if (ids.length < 2) return null;
  const label = roomActiveMembersLabel(group, ids);
  return <section data-room-parallel-progress aria-label={label} className="space-y-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
    <p className="text-[12px] text-accent">{label}</p>
    <ul className="grid gap-2 sm:grid-cols-2">
      {ids.map((id) => {
        const bot = members.find((member) => member.id === id);
        if (!bot) return null;
        const status = roomMemberState(group, id);
        return <li key={id} data-working-member={id} className="flex min-w-0 items-center gap-2">
          <BotAvatar bot={bot} size={28} state={status.pose} />
          <div className="min-w-0"><p className="truncate text-[13px] text-ink">{bot.name}</p><p className="truncate text-[12px] text-ink-secondary">{status.label}</p></div>
        </li>;
      })}
    </ul>
  </section>;
}
