import type { ReactNode, RefObject } from "react";
import { ChevronRight, Pause, Plus } from "lucide-react";

import { cn } from "@/lib/cn";
import { roomContextWarnings } from "@/lib/context-warning";
import { t } from "@/lib/i18n";
import { normalizeState } from "@/lib/mascot";
import { effectivePlace, placeLabelKey } from "@/lib/place";
import { openRoomPanel } from "@/lib/room-panel";
import { roomSpeakerIds } from "@/lib/room-threads";
import { type Bot, type Group } from "@/state/store";
import { RoomHeaderTools } from "./RoomHeaderTools";
import { BotAvatar } from "./Avatar";
import { RoomContextBadge } from "./ContextWarning";
import { useCaptionChrome } from "./DesktopCapabilities";
import { ExportTranscriptMenu } from "./ExportTranscriptMenu";
import { GroupUsageChip } from "./GroupUsageChip";
import { PlaceIcon } from "./PlaceIcon";
import { roomMemberQueueTitle } from "./RoomQueueList";
import { RoomWorkingFolderChip } from "./RoomWorkingFolder";

function memberMauses(group: Group, members: Bot[]) {
  const contextWarnings = roomContextWarnings(group, members);
  const speakersElsewhere = new Set(roomSpeakerIds(group).filter((id) => id !== group.busyBotId));
  return members.map((b) => {
    const busy = group.busyBotId === b.id;
    const queueTitle = busy ? undefined : roomMemberQueueTitle(group, members, b);
    const contextWarning = contextWarnings.find((warning) => warning.bot.id === b.id);
    const busyElsewhere = !busy && speakersElsewhere.has(b.id);
    const held = !group.dm && Boolean(group.holds?.[b.id]);
    const task = b.tasks?.find((candidate) => candidate.threadId === group.threadId);
    const effective = busy ? effectivePlace(b, task) : "off";
    const showPlace = busy && effective !== "off" && effective !== "auto";
    return (
      <span
        key={b.id}
        data-held={held || undefined}
        title={
          held
            ? t("room.holds.avatarHeld", { name: b.name })
            : queueTitle ?? (busyElsewhere
              ? t("room.memberWorkingElsewhere", { name: b.name })
              : `${b.name}${busy ? " — working…" : ""}${contextWarning ? ` — ${t("contextWarning.short", { percent: contextWarning.percent })}` : ""}`)
        }
        className={cn(
          "relative inline-flex rounded-full",
          busy && "ring-2 ring-accent/50 ring-offset-1 ring-offset-app",
          busyElsewhere && "ring-1 ring-hairline ring-offset-1 ring-offset-app",
          queueTitle && !busyElsewhere && "ring-1 ring-accent/30 ring-offset-1 ring-offset-app",
        )}
      >
        <span className={cn("inline-flex", held && "opacity-50 grayscale")}>
          <BotAvatar bot={b} state={normalizeState(b.mascotExpression) ?? "happy"} size={24} animated={false} />
        </span>
        {held && !busy && (
          <span
            className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full border border-app bg-raised text-ink-secondary"
            role="img"
            aria-label={t("room.holds.avatarHeld", { name: b.name })}
          >
            <Pause size={8} strokeWidth={3} aria-hidden="true" />
          </span>
        )}
        {contextWarning && <RoomContextBadge percent={contextWarning.percent} />}
        {busy && (
          showPlace ? (
            <span
              className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full border border-app bg-accent text-white"
              role="img"
              aria-label={t("place.chipAria", { place: t(placeLabelKey(effective)) })}
            >
              <PlaceIcon place={effective} size={9} strokeWidth={2.5} aria-hidden="true" />
            </span>
          ) : (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-app bg-accent" />
          )
        )}
      </span>
    );
  });
}

const SIMPLE_FACES = 3;

export function RoomHeader({
  group,
  members,
  simple,
  setupPending,
  remoteClient,
  onToggleFolder,
  onOpenMembers,
  membersTriggerRef,
  memberStrip,
}: {
  group: Group;
  members: Bot[];
  simple: boolean;
  setupPending: boolean;
  remoteClient: boolean;
  findOpen: boolean;
  onToggleFind: () => void;
  onToggleFolder: () => void;
  onOpenMembers: () => void;
  membersTriggerRef: RefObject<HTMLButtonElement | null>;
  memberStrip?: ReactNode;
}) {
  const { dragProps: headerDragProps, noDragStyle: headerNoDragStyle } = useCaptionChrome();
  const faces = memberStrip ? [] : memberMauses(group, members);
  const membersLabel = members.length === 1
    ? t("room.members.ariaOne")
    : t("room.members.ariaMany", { count: members.length });
  if (memberStrip) return <div {...headerDragProps} className="@container/roomhead botdom-room-header px-5 pl-11 md:pl-5">
    <div data-roomhead-row className="botdom-room-header-row">
      <div data-roomhead-identity className="min-w-0" style={headerNoDragStyle}>
        {remoteClient ? <span className="block truncate text-[14px] font-medium text-ink">{group.name}</span> : <button type="button" data-room-name
          onClick={event => openRoomPanel(group.id, event.currentTarget)} title={t("room.panel.open")} aria-label={t("room.panel.openAria", { name: group.name })} aria-haspopup="dialog"
          className="botdom-room-title botdom-interactive"><span className="truncate">{group.name}</span></button>}
      </div>
      <div data-roomhead-members className="min-w-0" style={headerNoDragStyle}>{memberStrip}</div>
      <div data-roomhead-controls className="flex items-center gap-0.5" style={headerNoDragStyle}>
        <RoomHeaderTools group={group} setupPending={setupPending} remoteClient={remoteClient} onOpenMembers={onOpenMembers} onToggleFolder={onToggleFolder} />
      </div>
    </div>
  </div>;
  if (simple) {
    const more = members.length - SIMPLE_FACES;
    return (
      <div {...headerDragProps} className={cn("@container/roomhead px-5 pl-11 md:pl-5", memberStrip ? "py-0.5" : "py-3")}>
        <div data-roomhead-row className={cn("flex items-end justify-between gap-3", memberStrip && "@max-md/roomhead:flex-wrap")}>
          <div data-roomhead-identity className={cn("flex min-w-0 flex-col items-start justify-center", memberStrip && "h-[34px] w-[160px] shrink-0 @max-md/roomhead:w-full")} style={headerNoDragStyle}>
            <button
              type="button"
              data-room-name
              onClick={(event) => openRoomPanel(group.id, event.currentTarget)}
              title={t("room.panel.open")}
              aria-label={t("room.panel.openAria", { name: group.name })}
              aria-haspopup="dialog"
              style={headerNoDragStyle}
              className="group -mx-2 flex min-w-0 max-w-[calc(100%+1rem)] items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-raised/60 focus-visible:bg-raised/60"
            >
              <span className="truncate text-[15px] font-semibold text-ink">{group.name}</span>
              <ChevronRight size={14} aria-hidden="true" className="-ml-1 w-0 shrink-0 text-ink-secondary opacity-0 transition-[width,margin,opacity] duration-150 group-hover:ml-0 group-hover:w-3.5 group-hover:opacity-100 group-focus-visible:ml-0 group-focus-visible:w-3.5 group-focus-visible:opacity-100" />
            </button>
            {!memberStrip && group.description && <p className="max-w-full truncate text-[12px] leading-4 text-ink-secondary">{group.description}</p>}
          </div>
          <div data-roomhead-controls className={cn("flex items-center", memberStrip ? "min-w-0 flex-1 @max-md/roomhead:basis-full" : "shrink-0")} style={headerNoDragStyle}>
            {memberStrip ?? <button
              ref={membersTriggerRef}
              type="button"
              data-room-faces
              onClick={onOpenMembers}
              title={t("room.members.manage")}
              aria-label={membersLabel}
              style={headerNoDragStyle}
              className="flex items-center rounded-full py-0.5 pl-1 pr-1.5 hover:bg-raised/60"
            >
              <span className="flex items-center -space-x-1.5">
                {faces.slice(0, SIMPLE_FACES)}
                {more > 0 && (
                  <span className="relative flex h-6 min-w-6 items-center justify-center rounded-full border border-app bg-raised px-1 text-[11px] font-medium tabular-nums text-ink-secondary">
                    +{more}
                  </span>
                )}
              </span>
            </button>}
          </div>
        </div>
      </div>
    );
  }
  return (
      <div
        {...headerDragProps}
        className={cn(
          // A container query never matches the container itself, so the row that wraps is the child below.
          "@container/roomhead px-5", memberStrip ? "py-0.5" : "py-3",
          "pl-11 md:pl-5",
        )}
      >
        <div data-roomhead-row className="flex items-end justify-between gap-2 @max-md/roomhead:flex-wrap @max-md/roomhead:gap-y-1">
        <div data-roomhead-identity className="flex h-[34px] w-[150px] min-w-0 shrink-0 items-center gap-2 @max-md/roomhead:basis-full" style={headerNoDragStyle}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-ink">{group.name}</span>
            </div>
            {!memberStrip && group.description && <p className="truncate text-[12px] leading-4 text-ink-secondary">{group.description}</p>}
          </div>
        </div>
        {memberStrip && <div className="mx-3 min-w-0 flex-1" style={headerNoDragStyle}>{memberStrip}</div>}
        <div
          data-roomhead-controls
          className="flex h-[34px] items-center gap-1.5 shrink-0 @max-md/roomhead:ml-auto @max-md/roomhead:flex-wrap @max-md/roomhead:justify-end"
        >
          <ExportTranscriptMenu
            title={group.name}
            messages={group.messages}
            isGroup
          />
          <GroupUsageChip usage={group.usage} />
          {!remoteClient && !setupPending && !group.dm && <RoomWorkingFolderChip group={group} onToggle={onToggleFolder} />}
          {!memberStrip && (group.dm || remoteClient ? (
            faces
          ) : (
            <button
              ref={membersTriggerRef}
              type="button"
              onClick={onOpenMembers}
              title={t("room.members.manage")}
              aria-label={membersLabel}
              className="flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-1.5 hover:bg-raised/60"
            >
              {faces}
              <span className="flex size-[18px] items-center justify-center rounded-full border border-dashed border-hairline/70 text-ink-secondary">
                <Plus size={11} />
              </span>
            </button>
          ))}
        </div>
        </div>
      </div>
  );
}
