import { DEFAULT_PERSON_MASCOT, personMascotSchema, type PersonAvatarProfile } from "../../shared/person-avatar";
import { BotAvatar, type BotAvatarProps } from "./Avatar";

export function personalAvatarBot(profile?: PersonAvatarProfile): BotAvatarProps["bot"] {
  const chosen = personMascotSchema.safeParse(profile?.avatarMascot);
  const mascot = chosen.success ? chosen.data : DEFAULT_PERSON_MASCOT;
  return { name: profile?.name || "User", color: mascot.color, mascotBody: mascot.body,
    avatarUrl: chosen.success ? null : profile?.avatarUrl, avatarCrop: "circle" };
}

export function PersonAvatar({ profile, size = 28, className, animated = true }: {
  profile?: PersonAvatarProfile; size?: number; className?: string; animated?: boolean;
}) {
  return <span className={className} style={{ display: "inline-flex", flexShrink: 0, width: size, height: size }} data-person-avatar>
    <BotAvatar bot={personalAvatarBot(profile)} size={size} animated={animated} />
  </span>;
}
