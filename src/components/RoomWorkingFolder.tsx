import { useState } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { api, ApiError, type Group } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { shortPath } from "@/lib/short-path";
import { useDesktopCapabilities } from "./DesktopCapabilities";

/**
 * PATCHed directly, not via patchGroup: the server validates the path, and a rejected folder must not stick in local
 * state. A room that already worked somewhere can still move while it is idle; every conversation then starts fresh there.
 */
export function RoomWorkingFolder({ group, heading = true }: { group: Group; heading?: boolean }) {
  const { capabilities } = useDesktopCapabilities();
  const home = capabilities.host.homeDir;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canPick = Boolean(window.ogb?.pickFolder);
  const current = roomWorkingFolder(group);

  const save = async (cwd: string | null) => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ cwd }) });
      setDraft(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t("room.folder.busy") : e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const pick = async () => {
    const chosen = await window.ogb?.pickFolder?.(current?.path ?? group.cwd);
    if (chosen) void save(chosen);
  };

  return (
    <div data-room-working-folder className="rounded-2xl bg-app p-4 ring-1 ring-hairline/35 shadow-[0_1px_2px_rgba(20,15,40,0.04),0_8px_22px_-14px_rgba(20,15,40,0.14)]">
      {heading && <>
        <div className="text-[15px] font-medium text-ink">{t("room.folder.title")}</div>
        <div className="mt-0.5 text-[12.5px] text-ink-secondary">{t("room.folder.detail")}</div>
      </>}
      <div className={cn("flex items-center gap-3", heading && "mt-3")}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-panel text-ink-secondary"><Folder size={18} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-ink">{current?.name ?? t("room.folder.own")}</div>
          {current && <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-tertiary" title={current.path}>{shortPath(current.path, home)}</div>}
        </div>
      </div>
      {canPick ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void pick()} disabled={saving}
            className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] text-card hover:opacity-85 disabled:opacity-40">
            <FolderOpen size={13} /> {t(saving ? "room.folder.saving" : "room.folder.change")}
          </button>
          {group.cwd && (
            <button type="button" onClick={() => void save(null)} disabled={saving}
              className="rounded-full border border-hairline/60 bg-app px-3 py-1.5 text-[12.5px] text-ink-secondary hover:border-ink/30 hover:text-ink disabled:opacity-40">
              {t("room.folder.useDefault")}
            </button>
          )}
        </div>
      ) : (
        <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save((draft ?? group.cwd ?? "").trim() || null); }}>
          <input
            className="min-w-0 flex-1 rounded-xl border border-hairline/50 bg-panel px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-ink-tertiary focus:border-ink/40 focus:outline-none"
            aria-label={t("room.folder.title")}
            placeholder={t("room.folder.placeholder")}
            value={draft ?? group.cwd ?? ""}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={saving || draft === null} className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] text-card hover:opacity-85 disabled:opacity-40">
            {t("common.save")}
          </button>
        </form>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-tertiary">{t("room.folder.changeHint")}</p>
      {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export function roomWorkingFolder(group: Group): { path: string; name: string } | null {
  const path = group.pinnedCwd === undefined ? group.cwd : (group.pinnedCwd ?? undefined);
  if (!path) return null;
  return { path, name: path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path };
}

export function RoomWorkingFolderChip({ group, onToggle }: { group: Group; onToggle: () => void }) {
  const folder = roomWorkingFolder(group);
  if (!folder) {
    return (
      <button
        onClick={onToggle}
        className="rounded-md p-1.5 text-ink-secondary hover:bg-raised hover:text-ink"
        title={t("room.folder.chipTitle")}
      >
        <Folder size={14} />
      </button>
    );
  }
  return (
    <button
      onClick={onToggle}
      className="flex max-w-[180px] items-center gap-1.5 rounded-full border border-hairline/40 bg-raised/60 px-2.5 py-1 text-[13px] text-ink-secondary hover:bg-raised hover:text-ink"
      title={t("chat.workingFolder", { folder: folder.path })}
    >
      <Folder size={12} />
      <span className="truncate font-mono">{folder.name}</span>
    </button>
  );
}
