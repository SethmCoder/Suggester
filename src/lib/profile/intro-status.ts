import type { TravelerProfile } from "@/lib/profile/traveler";
import { emptyTraveler } from "@/lib/profile/traveler";

/** True when this account already finished (or clearly doesn't need) the new-account chat. */
export function isIntroComplete(
  profile: TravelerProfile | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.completed) return true;
  if (profile.age?.trim()) return true;
  if (profile.dream?.trim()) return true;
  if ((profile.answers?.length ?? 0) >= 2) return true;
  const raw = profile as TravelerProfile & {
    travelIntelligence?: unknown;
  };
  // Returning users who only have intelligence saved still skip the new-account chat.
  if (raw.travelIntelligence && typeof raw.travelIntelligence === "object") {
    return true;
  }
  return false;
}

export function normalizeTravelerProfile(raw: unknown): TravelerProfile {
  if (!raw || typeof raw !== "object") return emptyTraveler();
  const p = raw as Partial<TravelerProfile> & Record<string, unknown>;
  return {
    ...emptyTraveler(),
    ...p,
    answers: Array.isArray(p.answers) ? p.answers : [],
    completed: Boolean(p.completed),
  };
}

/** Mark incomplete-but-known profiles as completed for persistence. */
export function markIntroComplete(profile: TravelerProfile): TravelerProfile {
  return { ...profile, completed: true };
}
