import type { RankedCandidate } from "../popularity/types";
import type { DayCityAssignment } from "../trips/legs";

export function buildItinerarySystemPrompt(): string {
  return `You are Waypoint's itinerary planner. You may ONLY schedule placeId values from the provided candidate list.
Never invent places, opening hours, popularity, social-media virality, or travel times.
NEVER invent vague relative stops such as "a bakery near your hotel", "lunch nearby", or "cafe by the hotel".
Every activity must use an exact placeId from the candidate list (a real named place).
Online-interest / popularity scores are SECONDARY ranking hints only — traveler interests, geography, pace, and budget matter more.
When a hotel anchor is provided for a day, prefer candidates close to that hotel.
For multi-city trips, only schedule places that belong to that day's city (candidates are tagged with city=).
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
  destinationContextBlock?: string;
  dayPlan?: DayCityAssignment[];
  hotelNotes?: string;
}): string {
  const candidateLines = input.candidates.slice(0, 60).map((c) => {
    const pop = c.popularity;
    const popPart =
      input.popularityEnabled && pop && pop.confidence >= 0.45
        ? ` popularityScore=${pop.score} trend=${pop.trend} sources=${pop.sources.join("|")}`
        : "";
    const cityPart =
      "city" in c && (c as { city?: string }).city
        ? ` city=${(c as { city?: string }).city}`
        : "";
    return `- placeId=${c.placeId} name=${c.displayName} types=${c.types.join(",")}${cityPart} rank=${c.combinedRank.toFixed(3)}${popPart}`;
  });

  const destCtx = input.destinationContextBlock
    ? `\n${input.destinationContextBlock}\n`
    : "";

  const dayLines =
    input.dayPlan
      ?.map((d) => {
        const hotel = d.hotel ? ` hotel="${d.hotel}"` : "";
        const transit = d.isArrivalTransitDay
          ? ` ARRIVAL_TRANSIT_FROM=${d.previousCity}`
          : "";
        return `- dayIndex=${d.dayIndex} city=${d.city}${hotel}${transit}`;
      })
      .join("\n") ?? "";

  return `Trip overview: ${input.destination}
Dates: ${input.startDate} to ${input.endDate}
Interests: ${input.interests.join(", ") || "general"}
Pace: ${input.intensity}
Local transport preference: ${input.transport}
Must-see names (resolve via candidates only): ${input.mustSee.join("; ") || "none"}
Avoid: ${input.avoid.join("; ") || "none"}
Ideal trip: ${input.idealTrip || "none"}
${input.hotelNotes ? `Hotels / anchors:\n${input.hotelNotes}\n` : ""}${destCtx}
Day plan (assign only candidates for that day's city):
${dayLines || "(single destination — all days same city)"}

Candidates (ONLY these placeIds are valid — never invent unnamed places):
${candidateLines.join("\n")}

Rules:
- Online-interest hints are SECONDARY. Prefer traveler interests, hotel proximity, and a realistic schedule.
- Never invent social-media virality or vague "near hotel" fillers.
- Intercity transit blocks may already be inserted by the system; do not invent train stations unless their placeId is listed.
Popularity data present: ${input.popularityEnabled ? "yes" : "no"}.`;
}
