import { z } from "zod";
import { mascotBodySchema } from "./mascot-bodies.ts";

export const PERSON_AVATAR_COLORS = ["purple", "blue", "teal", "green", "yellow", "orange", "pink", "red"] as const;
export const personMascotSchema = z.object({ color: z.enum(PERSON_AVATAR_COLORS), body: mascotBodySchema }).strict();
export type PersonMascot = z.infer<typeof personMascotSchema>;

/** A personal avatar is either an uploaded image or the same mascot appearance used by employee bots. */
export interface PersonAvatarProfile {
  name?: string;
  avatarUrl?: string;
  avatarMascot?: PersonMascot | null;
}

export const DEFAULT_PERSON_MASCOT: PersonMascot = { color: "blue", body: "cursor" };
