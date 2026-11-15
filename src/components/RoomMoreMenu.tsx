import type { Group } from "@/state/store";
import { openRoomPanel } from "@/lib/room-panel";
import { useState, type JSX } from "react";
import { Copy, Download, MoreHorizontal, Search, Settings } from "lucide-react";

import { requestChatFind, useChatFindOpen } from "@/lib/chat-find";
import { cn } from "@/lib/cn";
import {
  copyTranscriptToClipboard,
  downloadMarkdownTranscript,
  formatTranscriptMarkdown,
  slugifyTranscriptFilename,
} from "@/lib/export-transcript";
import { t } from "@/lib/i18n";
import { ShortcutHint } from "./ShortcutHint";
import { SidebarPopoverMenu, type SidebarMenuItem } from "./SidebarPopoverMenu";

function useRoomMoreItems(group: Group): { items: SidebarMenuItem[]; on: boolean } {
  const findOpen = useChatFindOpen(group.threadId);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const messages = group.messages;
  const hasMessages = messages.length > 0;
  const transcript = () => formatTranscriptMarkdown({ title: group.name, messages, isGroup: true });
  const items: SidebarMenuItem[] = [
    {
      key: "find",
      label: t("chat.find"),
      icon: <Search size={16} />,
      active: findOpen,
      trailing: <ShortcutHint id="find-conversation" />,
      onSelect: () => requestChatFind(group.threadId),
    },
    {
      key: "copy",
      heading: t("chat.export.heading"),
      separatorBefore: true,
      label: t("chat.export.copy"),
      icon: <Copy size={16} />,
      disabled: !hasMessages,
      keepOpen: true,
      trailing: copyStatus && <span role="status" className="text-[11px] text-ink-secondary">{t(copyStatus === "copied" ? "chat.export.copied" : "chat.export.copyFailed")}</span>,
      onSelect: () => { void copyTranscriptToClipboard(transcript()).then((ok) => setCopyStatus(ok ? "copied" : "failed")); },
    },
    {
      key: "download",
      label: t("chat.export.download"),
      icon: <Download size={16} />,
      disabled: !hasMessages,
      onSelect: () => downloadMarkdownTranscript(slugifyTranscriptFilename(group.name), transcript()),
    },
    { key: "settings", label: t("p0.group.settings"), icon: <Settings size={16} />, onSelect: () => openRoomPanel(group.id) },
  ];
  return { items, on: findOpen };
}

function RoundRoomMoreMenu({ group }: { group: Group }) {
  const { items, on } = useRoomMoreItems(group);
  return (
    <SidebarPopoverMenu
      items={items}
      ariaLabel={t("chat.more")}
      triggerClassName="rounded-full"
      triggerTitle={t("chat.more")}
      renderTrigger={({ open }) => (
        <span
          data-testid="room-more"
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-raised/50 transition-colors hover:bg-raised",
            "max-md:size-9 max-md:border max-md:border-hairline max-md:bg-card",
            open || on ? "text-accent" : "text-ink",
          )}
        >
          <MoreHorizontal size={16} />
        </span>
      )}
    />
  );
}

export function RoomMoreMenu({ group }: { group: Group }): JSX.Element {
  // Keyed by thread so a "Copied" note never follows the panel into another conversation.
  return <RoundRoomMoreMenu key={group.threadId} group={group} />;
}
