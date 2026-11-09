import {
  INTRO_COOKIE,
  emptyTraveler,
  type TravelerProfile,
} from "@/lib/profile/traveler";

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

export type IntroAccountSignals = {
  profile?: TravelerProfile | null;
  tripCount?: number | null;
  futureTripCount?: number | null;
  wishlistCount?: number | null;
  /** Profile row age in ms; accounts older than a day are treated as returning. */
  profileAgeMs?: number | null;
};

/**
 * New-account survey should only run for brand-new signups.
 * Returning accounts (prior trips/research, finished intro, or older profile) skip it.
 */
export function shouldSkipIntro(signals: IntroAccountSignals): boolean {
  if (isIntroComplete(signals.profile)) return true;
  if ((signals.tripCount ?? 0) > 0) return true;
  if ((signals.futureTripCount ?? 0) > 0) return true;
  if ((signals.wishlistCount ?? 0) > 0) return true;
  if ((signals.profileAgeMs ?? 0) >= 24 * 60 * 60 * 1000) return true;
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

/** Client-side intro cookie so middleware stops bouncing to /welcome. */
export function setIntroCookieClient() {
  if (typeof document === "undefined") return;
  document.cookie = `${INTRO_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
}
