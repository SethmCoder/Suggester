import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExplanations } from "./derive";
import { emptyIntelligence, type TravelIntelligence } from "./types";

export function effectiveInterestsServer(profile: TravelIntelligence): string[] {
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

/** Map intelligence weights into generateItinerary interestWeights (1–3). */
export function interestWeightsFromIntelligence(
  profile: TravelIntelligence,
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const interest of profile.explicit.interests) {
    weights[interest] = Math.max(weights[interest] ?? 1, 2);
  }
  if (!profile.personalizationEnabled) return weights;
  for (const row of profile.inferred.interests) {
    if (row.evidence < 2) continue;
    const score = row.weight >= 2 ? 3 : row.weight >= 1.25 ? 2 : 1;
    weights[row.interest] = Math.max(weights[row.interest] ?? 1, score);
  }
  for (const row of profile.inferred.downrankedInterests) {
    if (row.evidence < 2 || row.weight < 1.25) continue;
    weights[row.interest] = 0.5;
  }
  return weights;
}

export function downrankedInterestsServer(profile: TravelIntelligence): string[] {
  if (!profile.personalizationEnabled) return [];
  return profile.inferred.downrankedInterests
    .filter((row) => row.evidence >= 2 && row.weight >= 1.25)
    .map((row) => row.interest);
}

export function parseTravelIntelligence(raw: unknown): TravelIntelligence {
  if (!raw || typeof raw !== "object") return emptyIntelligence();
  const bag = raw as { travelIntelligence?: TravelIntelligence } & TravelIntelligence;
  if (bag.travelIntelligence?.version === 1) {
    return {
      ...bag.travelIntelligence,
      explanations: buildExplanations(bag.travelIntelligence),
    };
  }
  if (bag.version === 1) {
    return {
      ...(bag as TravelIntelligence),
      explanations: buildExplanations(bag as TravelIntelligence),
    };
  }
  return emptyIntelligence();
}

export async function loadTravelIntelligence(
  supabase: SupabaseClient,
  userId: string,
): Promise<TravelIntelligence> {
  const { data } = await supabase
    .from("profiles")
    .select("traveler_profile")
    .eq("id", userId)
    .maybeSingle();
  return parseTravelIntelligence(data?.traveler_profile);
}

export function intelligenceContextPayload(profile: TravelIntelligence) {
  return {
    personalizationEnabled: profile.personalizationEnabled,
    explicit: profile.explicit,
    effectiveInterests: effectiveInterestsServer(profile),
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
