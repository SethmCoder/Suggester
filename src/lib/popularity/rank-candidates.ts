import { getPopularityConfig } from "../config/popularity";
import { combinePersonalizationRank } from "./score";
import type { PopularitySignals, RankedCandidate } from "./types";

export interface CandidatePlace {
  placeId: string;
  displayName: string;
  types: string[];
  lat: number;
  lng: number;
  interestMatch: number;
  geoFit: number;
}

export function rankCandidatesWithPopularity(input: {
  candidates: CandidatePlace[];
  popularityByPlaceId: Map<string, PopularitySignals>;
  prefersHiddenGems: boolean;
}): RankedCandidate[] {
  const config = getPopularityConfig();
  const weight = config.enabled ? config.weight : 0;

  return input.candidates
    .map((c) => {
      const popularity = input.popularityByPlaceId.get(c.placeId) ?? null;
      const combinedRank = combinePersonalizationRank({
        interestMatch: c.interestMatch,
        geoFit: c.geoFit,
        popularityScore: popularity?.score ?? 0,
        popularityConfidence: popularity?.confidence ?? 0,
        popularityWeight: weight,
        prefersHiddenGems: input.prefersHiddenGems,
      });
      return { ...c, popularity, combinedRank };
    })
    .sort((a, b) => b.combinedRank - a.combinedRank);
}
