import {
  emptyIntelligence,
  INTELLIGENCE_STORAGE_KEY,
  type IntelligenceSignal,
  type TravelIntelligence,
  type WeightedInterest,
} from "./types";
import { applySignal, buildExplanations } from "./derive";
import { listItems } from "@/lib/wishlist/store";
import { listFutureTrips } from "@/lib/future-trips/store";
import {
  emptyTraveler,
  TRAVELER_STORAGE_KEY,
  type TravelerProfile,
} from "@/lib/profile/traveler";

function readRaw(): TravelIntelligence {
  if (typeof window === "undefined") return emptyIntelligence();
  try {
    const raw = localStorage.getItem(INTELLIGENCE_STORAGE_KEY);
    if (!raw) return emptyIntelligence();
    const parsed = JSON.parse(raw) as TravelIntelligence;
    if (parsed?.version !== 1) return emptyIntelligence();
    return parsed;
  } catch {
    return emptyIntelligence();
  }
}

function writeRaw(value: TravelIntelligence) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INTELLIGENCE_STORAGE_KEY, JSON.stringify(value));
}

function readIntro(): TravelerProfile {
  if (typeof window === "undefined") return emptyTraveler();
  try {
    const raw = localStorage.getItem(TRAVELER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TravelerProfile) : emptyTraveler();
  } catch {
    return emptyTraveler();
  }
}

/** Merge intro dream/answers and Phase 1 lists into the intelligence snapshot. */
export function hydrateIntelligence(base?: TravelIntelligence): TravelIntelligence {
  const current = base ?? readRaw();
  const intro = readIntro();
  const wishlist = listItems();
  const futures = listFutureTrips();

  const preferredDestinations = [
    ...new Set([
      ...current.inferred.preferredDestinations,
      ...futures.map((trip) => trip.destination),
      ...wishlist
        .filter((item) => item.category === "destination")
        .map((item) => item.name),
    ]),
  ].slice(0, 40);

  const previousDestinations = [
    ...new Set([
      ...current.inferred.previousDestinations,
      ...futures
        .filter((trip) => trip.convertedTripId || trip.status === "completed")
        .map((trip) => trip.destination),
    ]),
  ].slice(0, 40);

  let next: TravelIntelligence = {
    ...current,
    inferred: {
      ...current.inferred,
      preferredDestinations,
      previousDestinations,
    },
  };

  if (intro.dream && !next.explicit.favoriteExperiences.includes(intro.dream)) {
    next = {
      ...next,
      explicit: {
        ...next.explicit,
        favoriteExperiences: [intro.dream, ...next.explicit.favoriteExperiences].slice(0, 12),
      },
    };
  }

  next = {
    ...next,
    explanations: buildExplanations(next),
    updatedAt: new Date().toISOString(),
  };
  writeRaw(next);
  return next;
}

export function readIntelligence(): TravelIntelligence {
  return hydrateIntelligence();
}

export function replaceIntelligence(value: TravelIntelligence) {
  writeRaw({
    ...value,
    explanations: buildExplanations(value),
    updatedAt: new Date().toISOString(),
  });
}

export function recordIntelligenceSignal(signal: IntelligenceSignal): TravelIntelligence {
  const next = applySignal(hydrateIntelligence(), signal);
  const withExplain = {
    ...next,
    explanations: buildExplanations(next),
    updatedAt: new Date().toISOString(),
  };
  writeRaw(withExplain);
  return withExplain;
}

export function effectiveInterests(profile: TravelIntelligence): string[] {
  if (!profile.personalizationEnabled) return profile.explicit.interests;
  const inferred = profile.inferred.interests
    .filter((row) => row.evidence >= 2 && row.weight >= 1.25)
    .sort((a, b) => b.weight - a.weight)
    .map((row) => row.interest);
  const down = new Set(
    profile.inferred.downrankedInterests
      .filter((row) => row.evidence >= 2 && row.weight >= 1.25)
      .map((row) => row.interest),
  );
  return [...new Set([...profile.explicit.interests, ...inferred])].filter(
    (interest) => !down.has(interest),
  );
}

export function intelligenceForPrompt(profile: TravelIntelligence): Record<string, unknown> {
  return {
    personalizationEnabled: profile.personalizationEnabled,
    explicit: profile.explicit,
    effectiveInterests: effectiveInterests(profile),
    preferredDestinations: profile.inferred.preferredDestinations.slice(0, 12),
    previousDestinations: profile.inferred.previousDestinations.slice(0, 12),
    downrankedInterests: profile.inferred.downrankedInterests
      .filter((row) => row.evidence >= 2)
      .map((row) => row.interest)
      .slice(0, 8),
    explanations: profile.explanations.slice(0, 6),
    note: "Inferred preferences need repeated evidence. Do not invent sensitive traits.",
  };
}

export type { WeightedInterest };
