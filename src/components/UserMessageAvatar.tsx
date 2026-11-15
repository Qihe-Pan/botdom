import { UserRound } from "lucide-react";
import type { Message } from "@/state/store";
import { useStore } from "@/state/store";
import { useReactor } from "@/lib/cloud-guest";
import { InitialsAvatar } from "./Avatar";
import { PersonAvatar } from "./PersonAvatar";

export function UserMessageAvatar({ message }: { message: Message }) {
  const { state } = useStore();
  const reactor = useReactor();
  const profile = state.config?.profile;
  const own = !state.config?.team || Boolean(message.sender?.id && message.sender.id === reactor);
  const name = (own ? profile?.name : message.sender?.name)?.trim() || message.sender?.name?.trim() || "";
  const initials = Array.from(name).slice(0, 2).join("").toLocaleUpperCase();
  return <span data-user-avatar className="ml-1 flex shrink-0 self-center" role="img" aria-label={name || "User"}>
    {own ? <PersonAvatar profile={profile} size={28} /> : <InitialsAvatar initials={initials} size={28} fallback={!initials ? <UserRound size={15} aria-hidden="true" /> : undefined} />}
  </span>;
}
