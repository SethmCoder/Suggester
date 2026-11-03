import type { RankedCandidate } from "../popularity/types";

export function buildItinerarySystemPrompt(): string {
  return `You are Waypoint's itinerary planner. You may ONLY schedule placeId values from the provided candidate list.
Never invent places, opening hours, popularity, or travel times.
Use popularity scores only as ranking hints alongside interests, geography, pace, and budget.
Respect must-see and avoid lists. Do not repeat the same attraction across days unless unavoidable.
Return JSON matching the schema exactly.`;
}

export function buildItineraryUserPrompt(input: {
  destination: string;
  startDate: string;
  endDate: string;
  interests: string[];
  intensity: string;
  transport: string;
  mustSee: string[];
  avoid: string[];
  idealTrip: string;
  candidates: RankedCandidate[];
  popularityEnabled: boolean;
}): string {
  const candidateLines = input.candidates.slice(0, 40).map((c) => {
    const pop = c.popularity;
    const popPart =
      input.popularityEnabled && pop && pop.confidence >= 0.45
        ? ` popularityScore=${pop.score} trend=${pop.trend} sources=${pop.sources.join("|")}`
        : "";
    return `- placeId=${c.placeId} name=${c.displayName} types=${c.types.join(",")} rank=${c.combinedRank.toFixed(3)}${popPart}`;
  });

  return `Destination: ${input.destination}
Dates: ${input.startDate} to ${input.endDate}
Interests: ${input.interests.join(", ") || "general"}
Pace: ${input.intensity}
Transport: ${input.transport}
Must-see names (resolve via candidates only): ${input.mustSee.join("; ") || "none"}
Avoid: ${input.avoid.join("; ") || "none"}
Ideal trip: ${input.idealTrip || "none"}

Candidates (only these placeIds are valid):
${candidateLines.join("\n")}

Popularity data present: ${input.popularityEnabled ? "yes" : "no"}. If no, do not mention trending.`;
}
