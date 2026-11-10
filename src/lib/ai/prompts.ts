import type { RankedCandidate } from "../popularity/types";
import type { DayCityAssignment } from "../trips/legs";

export function buildItinerarySystemPrompt(): string {
  return `You are Waypoint's itinerary planner. You may ONLY schedule placeId values from the provided candidate list.
Never invent places, opening hours, popularity, social-media virality, or travel times.
The scheduler moves each visit into published opening hours when a source lists them, and leaves off a place that is closed that day. Do not guess a time the source did not publish.
NEVER invent vague relative stops such as "a bakery near your hotel", "lunch nearby", or "cafe by the hotel".
Every activity must use an exact placeId from the candidate list (a real named place).
Return one day object for EVERY dayIndex in the day plan. Fill each day with 3–5 real candidate places (relaxed ≈3, balanced ≈3–4, packed ≈4–5). Never leave a day empty or with only one stop, and never schedule a placeholder such as "free day" or "free block".
Online-interest / popularity scores are SECONDARY ranking hints only — traveler interests, geography, pace, and budget matter more.
When a hotel anchor is provided for a day, prefer candidates close to that hotel.
Never invent hotel names or review quotes. Use only the hotel anchor name that was provided.
For multi-city trips, only schedule places that belong to that day's city (candidates are tagged with city=).
The system inserts intercity transit blocks (flight, major train, ferry, coach, car) with departure windows — do not invent generic "transfer" stops.
Major train means long-distance / high-speed rail that typically needs booking; regional rail is local/commuter.
Respect must-see (major stops) and avoid lists. Prefer soft "preferred" names when filling remaining slots, but do not leave days empty if a preferred place is missing from candidates.
When the traveler named major stops, schedule those first from the candidate list, then fill the rest of each day from interests — do not drop unrelated days to rewrite the whole trip.
When a weather forecast marks a day as wet/rainy, do NOT schedule outdoor parks, beaches, viewpoints, or trails that day — prefer museums, markets, galleries, and indoor food. Only keep an outdoor must-see on a wet day if no indoor alternative exists.
Do not repeat the same attraction across days unless unavoidable.
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
  preferred?: string[];
  avoid: string[];
  idealTrip: string;
  candidates: RankedCandidate[];
  popularityEnabled: boolean;
  destinationContextBlock?: string;
  dayPlan?: DayCityAssignment[];
  hotelNotes?: string;
  weatherBlock?: string;
  interestWeights?: Record<string, number>;
  party?: string;
  dietary?: string;
  indoorOutdoor?: string;
  maxWalkMinutes?: number;
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
    const hoursPart =
      "openingHours" in c && (c as { openingHours?: string }).openingHours
        ? ` hours=${(c as { openingHours?: string }).openingHours}`
        : "";
    return `- placeId=${c.placeId} name=${c.displayName} types=${c.types.join(",")}${cityPart} rank=${c.combinedRank.toFixed(3)}${popPart}${hoursPart}`;
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

  const weightLines = Object.entries(input.interestWeights ?? {})
    .filter(([, weight]) => Number.isFinite(weight))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([interest, weight]) => `${interest}=${weight}`)
    .join(", ");

  return `Trip overview: ${input.destination}
Dates: ${input.startDate} to ${input.endDate}
Interests: ${input.interests.join(", ") || "general"}
Interest weights (higher = lead the day): ${weightLines || "equal"}
Party: ${input.party || "unspecified"}
Dietary: ${input.dietary || "none"}
Indoor/outdoor lean: ${input.indoorOutdoor || "either"}
Max walk between stops: ${input.maxWalkMinutes ? `${input.maxWalkMinutes} minutes` : "flexible"}
Pace: ${input.intensity}
Local transport preference: ${input.transport}
Major stops / must-see (hard — schedule from candidates when present): ${input.mustSee.join("; ") || "none"}
Preferred stops (soft — use when filling remaining day slots): ${(input.preferred ?? []).join("; ") || "none"}
Avoid: ${input.avoid.join("; ") || "none"}
Ideal trip: ${input.idealTrip || "none"}
${input.hotelNotes ? `Hotels / anchors:\n${input.hotelNotes}\n` : ""}${destCtx}${
    input.weatherBlock ? `\n${input.weatherBlock}\n` : ""
  }
Day plan (assign only candidates for that day's city):
${dayLines || "(single destination — all days same city)"}

Candidates (ONLY these placeIds are valid — never invent unnamed places):
${candidateLines.join("\n")}

Rules:
- Include every dayIndex from the day plan above — not only day 0.
- Schedule major stops first (priority must_see). Then fill remaining slots from preferred stops and traveler interests until each day has several stops.
- On wet forecast days, fill with indoor candidates; skip outdoor parks/beaches/viewpoints unless they are hard must-sees with no indoor substitute.
- Online-interest hints are SECONDARY. Prefer traveler interests, hotel proximity, weather fit, and a realistic schedule.
- Never invent social-media virality or vague "near hotel" fillers.
- Intercity transit blocks may already be inserted by the system (labeled Flight / Major train / Ferry / etc.); schedule sightseeing after the transit arrival window. Do not invent stations unless their placeId is listed.
Popularity data present: ${input.popularityEnabled ? "yes" : "no"}.`;
}
