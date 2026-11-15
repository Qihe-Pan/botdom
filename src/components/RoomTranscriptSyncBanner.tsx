import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";

export function RoomTranscriptSyncBanner({ groupId }: { groupId: string }) {
  const { state, dispatch } = useStore();
  const sync = state.roomTranscriptSync?.[groupId];
  if (!sync || (sync.phase === "waiting" && !sync.overflow)) return null;
  const failed = sync.phase === "failed";
  return <div role={failed ? "alert" : "status"} className="mx-4 my-2 flex items-center justify-between gap-3 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-[12px] text-ink-secondary">
    <span>{t(failed ? "room.messages.syncFailed" : "room.messages.syncing")}</span>
    {failed && <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-accent hover:bg-accent/10"
      onClick={() => dispatch({ type: "switchGroupTask", groupId, threadId: sync.threadId })}>{t("chat.retry")}</button>}
  </div>;
}
