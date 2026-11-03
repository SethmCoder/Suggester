import Groq from "groq-sdk";
import { getPopularityConfig } from "../config/popularity";
import {
  geocodeDestination,
  getPlaceDetails,
  searchInterestPlaces,
  textSearchPlace,
} from "../google/places";
import { getPopularityForDestination } from "../popularity/service";
import { rankCandidatesWithPopularity } from "../popularity/rank-candidates";
import type { RankedCandidate } from "../popularity/types";
import { popularityLabelText } from "../popularity/score";
import { buildItinerarySystemPrompt, buildItineraryUserPrompt } from "./prompts";
import { itineraryGenerationSchema, type ItineraryGeneration } from "./schema";
import { logger } from "../logger";
import { checkVisitAgainstHours } from "./hours";
import { addMinutes, orderByNearestNeighbor } from "./scheduler";
import { computeDayRoute } from "../google/routes";

export interface TripPreferencesInput {
  destination: string;
  startDate: string;
  endDate: string;
  interests: string[];
  intensity: "relaxed" | "balanced" | "packed";
  transport: string;
  mustSee: string[];
  avoid: string[];
  idealTrip: string;
  prefersHiddenGems?: boolean;
  budget?: number;
}

export interface GeneratedActivity {
  placeId: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  startTime: string;
  durationMinutes: number;
  priority: "must_see" | "preferred" | "optional";
  planningNote?: string;
  hoursVerified: boolean;
  websiteUri?: string;
  googleMapsUri?: string;
  popularityLabel?: string | null;
  popularitySources?: string[];
  popularityAttributionUrls?: string[];
  travelMinutesFromPrev?: number;
  scheduleWarnings?: string[];
  photoName?: string;
  openingHours?: unknown;
}

export interface GeneratedDay {
  dayIndex: number;
  activities: GeneratedActivity[];
  totalTravelMinutes?: number;
  totalWalkMeters?: number;
  routePolyline?: string;
}

function interestMatch(types: string[], interests: string[]): number {
  if (!interests.length) return 0.5;
  const lower = types.map((t) => t.toLowerCase());
  let hits = 0;
  for (const i of interests) {
    const token = i.toLowerCase();
    if (lower.some((t) => t.includes(token) || token.includes(t))) hits += 1;
  }
  return Math.min(1, hits / interests.length);
}

function dayCount(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

async function resolveMustSees(
  names: string[],
  destination: string,
  lat: number,
  lng: number,
) {
  const hits = [];
  for (const name of names.slice(0, 8)) {
    const hit = await textSearchPlace({
      query: `${name} ${destination}`,
      centerLat: lat,
      centerLng: lng,
      radiusMeters: 40000,
    });
    if (hit) hits.push(hit);
  }
  return hits;
}

async function callGroq(
  prefs: TripPreferencesInput,
  candidates: RankedCandidate[],
): Promise<ItineraryGeneration | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const client = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
  const popConfig = getPopularityConfig();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ItineraryGeneration",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["days"],
          properties: {
            days: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["dayIndex", "activities"],
                properties: {
                  dayIndex: { type: "integer" },
                  activities: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: [
                        "placeId",
                        "startTime",
                        "durationMinutes",
                        "priority",
                      ],
                      properties: {
                        placeId: { type: "string" },
                        startTime: { type: "string" },
                        durationMinutes: { type: "integer" },
                        priority: {
                          type: "string",
                          enum: ["must_see", "preferred", "optional"],
                        },
                        planningNote: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
            warnings: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    messages: [
      { role: "system", content: buildItinerarySystemPrompt() },
      {
        role: "user",
        content: buildItineraryUserPrompt({
          destination: prefs.destination,
          startDate: prefs.startDate,
          endDate: prefs.endDate,
          interests: prefs.interests,
          intensity: prefs.intensity,
          transport: prefs.transport,
          mustSee: prefs.mustSee,
          avoid: prefs.avoid,
          idealTrip: prefs.idealTrip,
          candidates,
          popularityEnabled: popConfig.enabled,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = itineraryGenerationSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (err) {
    logger.error("itinerary_schema_invalid", {
      error: err instanceof Error ? err.message : "parse",
    });
    return null;
  }
}

function fallbackSchedule(
  prefs: TripPreferencesInput,
  candidates: RankedCandidate[],
): ItineraryGeneration {
  const days = dayCount(prefs.startDate, prefs.endDate);
  const perDay = prefs.intensity === "packed" ? 4 : prefs.intensity === "relaxed" ? 2 : 3;
  const result = [];
  let idx = 0;
  for (let d = 0; d < days; d++) {
    const activities = [];
    for (let a = 0; a < perDay && idx < candidates.length; a++, idx++) {
      const c = candidates[idx];
      activities.push({
        placeId: c.placeId,
        startTime: `${9 + a * 2}`.padStart(2, "0") + ":00",
        durationMinutes: 90,
        priority: "preferred" as const,
      });
    }
    result.push({ dayIndex: d, activities });
  }
  return { days: result };
}

export async function generateItinerary(prefs: TripPreferencesInput): Promise<{
  days: GeneratedDay[];
  warnings: string[];
  popularityUsed: boolean;
}> {
  const geo = await geocodeDestination(prefs.destination);
  if (!geo) {
    throw new Error(
      "Could not geocode destination. Configure GOOGLE_MAPS_SERVER_KEY.",
    );
  }

  const popConfig = getPopularityConfig();
  let popularityMap = new Map<string, import("../popularity/types").PopularitySignals>();
  if (popConfig.enabled) {
    try {
      popularityMap = await getPopularityForDestination({
        destination: prefs.destination,
        destinationLat: geo.lat,
        destinationLng: geo.lng,
      });
    } catch (err) {
      logger.warn("popularity_skipped", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const [interestHits, mustHits] = await Promise.all([
    searchInterestPlaces({
      destination: prefs.destination,
      centerLat: geo.lat,
      centerLng: geo.lng,
      interests: prefs.interests.length ? prefs.interests : ["tourist attraction"],
    }),
    resolveMustSees(prefs.mustSee, prefs.destination, geo.lat, geo.lng),
  ]);

  const byId = new Map<string, (typeof interestHits)[0]>();
  for (const h of [...interestHits, ...mustHits]) byId.set(h.placeId, h);
  for (const pid of popularityMap.keys()) {
    if (!byId.has(pid)) {
      const d = await getPlaceDetails(pid);
      if (d)
        byId.set(pid, {
          placeId: d.placeId,
          displayName: d.displayName,
          lat: d.lat,
          lng: d.lng,
          types: d.types,
          formattedAddress: d.formattedAddress,
        });
    }
  }

  const candidatesRaw = [...byId.values()].map((c) => ({
    placeId: c.placeId,
    displayName: c.displayName,
    types: c.types,
    lat: c.lat,
    lng: c.lng,
    interestMatch: interestMatch(c.types, prefs.interests),
    geoFit: 1 - Math.min(1, Math.hypot(c.lat - geo.lat, c.lng - geo.lng) / 0.5),
  }));

  const ranked = rankCandidatesWithPopularity({
    candidates: candidatesRaw,
    popularityByPlaceId: popularityMap,
    prefersHiddenGems: Boolean(prefs.prefersHiddenGems),
  });

  const avoidLower = prefs.avoid.map((a) => a.toLowerCase());
  const filtered = ranked.filter(
    (c) => !avoidLower.some((a) => c.displayName.toLowerCase().includes(a)),
  );

  let ai = await callGroq(prefs, filtered);
  if (!ai) ai = fallbackSchedule(prefs, filtered);

  const warnings = ai.warnings ?? [];
  const detailsCache = new Map<string, Awaited<ReturnType<typeof getPlaceDetails>>>();

  const routeMode =
    prefs.transport === "driving"
      ? "DRIVE"
      : prefs.transport === "transit"
        ? "TRANSIT"
        : "WALK";

  const tripStart = new Date(prefs.startDate);
  const days: GeneratedDay[] = [];
  for (const day of ai.days) {
    const dayActs = day.activities.filter((a) => byId.has(a.placeId));
    const orderedIds = orderByNearestNeighbor(
      dayActs.map((a) => {
        const b = byId.get(a.placeId)!;
        return { ...a, lat: b.lat, lng: b.lng, placeId: a.placeId };
      }),
    );

    const activities: GeneratedActivity[] = [];
    let cursorTime = "09:00";
    const dayDate = new Date(tripStart);
    dayDate.setDate(dayDate.getDate() + day.dayIndex);

    for (let i = 0; i < orderedIds.length; i++) {
      const act = orderedIds[i];
      if (!byId.has(act.placeId)) {
        warnings.push(`Dropped unknown placeId ${act.placeId}`);
        continue;
      }
      if (!detailsCache.has(act.placeId)) {
        detailsCache.set(act.placeId, await getPlaceDetails(act.placeId));
      }
      const details = detailsCache.get(act.placeId);
      const base = byId.get(act.placeId)!;
      const pop = popularityMap.get(act.placeId);
      const label =
        pop && pop.label ? popularityLabelText(pop.label) : null;

      const scheduleWarnings: string[] = [];
      const hoursCheck = checkVisitAgainstHours({
        openingHours: details?.regularOpeningHours,
        visitStartTime: cursorTime,
        durationMinutes: act.durationMinutes,
        dayDate,
      });
      if (hoursCheck.warning) scheduleWarnings.push(hoursCheck.warning);
      if (!hoursCheck.ok) {
        warnings.push(
          `${details?.displayName ?? base.displayName}: ${hoursCheck.warning}`,
        );
      }

      activities.push({
        placeId: act.placeId,
        name: details?.displayName ?? base.displayName,
        address: details?.formattedAddress ?? base.formattedAddress,
        lat: details?.lat ?? base.lat,
        lng: details?.lng ?? base.lng,
        startTime: cursorTime,
        durationMinutes: act.durationMinutes,
        priority: act.priority,
        planningNote: act.planningNote,
        hoursVerified: Boolean(details?.hoursVerified),
        websiteUri: details?.websiteUri,
        googleMapsUri: details?.googleMapsUri,
        photoName: details?.photoName,
        openingHours: details?.regularOpeningHours,
        popularityLabel: label,
        popularitySources: pop?.sources,
        popularityAttributionUrls: pop?.attributionUrls,
        scheduleWarnings,
        travelMinutesFromPrev: 0,
      });

      cursorTime = addMinutes(cursorTime, act.durationMinutes + 15);
    }

    const points = activities.map((a) => ({ lat: a.lat, lng: a.lng }));
    const route = await computeDayRoute({ mode: routeMode, points });
    if (route) {
      for (let i = 1; i < activities.length; i++) {
        const leg = route.legs[i - 1];
        const travel = leg?.durationMinutes ?? 0;
        activities[i].travelMinutesFromPrev = travel;
        if (travel > 45) {
          warnings.push(
            `Long transfer (${travel} min) before ${activities[i].name}`,
          );
        }
        activities[i].startTime = addMinutes(
          activities[i - 1].startTime,
          activities[i - 1].durationMinutes + travel,
        );
      }
    }

    days.push({
      dayIndex: day.dayIndex,
      activities,
      totalTravelMinutes: route?.totalDurationMinutes,
      totalWalkMeters:
        routeMode === "WALK" ? route?.totalDistanceMeters : undefined,
      routePolyline: route?.polyline,
    });
  }

  return {
    days,
    warnings,
    popularityUsed: popConfig.enabled && popularityMap.size > 0,
  };
}
