import { plannerModel } from "@/lib/billing/model";
import { groqChat } from "@/lib/ai/groq";
import { getPopularityConfig } from "../config/popularity";
import {
  formatDestinationContextForPrompt,
  fetchSortedDestinationContext,
} from "../destination/sorted-travel";
import { scorePlacesOnlineInterest } from "../interest/wikimedia-pageviews";
import {
  computeDayRoute,
  geocodeDestination,
  getPlaceDetails,
  searchInterestPlaces,
  textSearchPlace,
} from "../maps";
import {
  discoveredToPlaceHits,
  discoverPlacesFromOsm,
} from "../places/osm-discover";
import {
  budgetFitScore,
  combineDiscoveryRank,
  paceFitScore,
  placeQualityScore,
} from "../places/rank";
import type { OnlineInterestSignal } from "../places/types";
import { getPopularityForDestination } from "../popularity/service";
import { rankCandidatesWithPopularity } from "../popularity/rank-candidates";
import type { PopularitySignals, RankedCandidate } from "../popularity/types";
import { popularityLabelText } from "../popularity/score";
import { buildItinerarySystemPrompt, buildItineraryUserPrompt } from "./prompts";
import { itineraryGenerationSchema, type ItineraryGeneration } from "./schema";
import { logger } from "../logger";
import { fitVisit } from "./hours";
import {
  addMinutes,
  fitDayClock,
  haversineKm,
  orderByRoutedNeighbor,
} from "./scheduler";
import {
  applyDayConstraints,
  cuisineConflicts,
  missingMustSees,
  nameIsAvoided,
  partyFit,
  settingFit,
  stopCap,
  wantsStepFree,
  weightedInterestMatch,
  type SettingLean,
  type TravelParty,
} from "./constraints";
import {
  dropRepeatedExperiences,
  expandInterestQueries,
  explainStop,
  experienceBucket,
  noteIsGeneric,
  validateAiDay,
} from "./validate-day";
import { interestSynonyms } from "./validate-day";
import { anchorUnbookedLegs } from "../hotels/hotelrec";
import type { TripLeg } from "../types/trip";
import { expandLegsToDays, legsLabel } from "../trips/legs";
import { planIntercityTransit } from "../trips/intercity-transit";
import {
  primaryDestinationLabel,
  resolveTripLegs,
} from "../trips/resolve-legs";
import { nameMatchesStop } from "../trips/major-stops";
import {
  fetchDailyWeather,
  formatWeatherLine,
  weatherForDate,
  weatherPromptBlock,
} from "../weather/open-meteo";
import { isOutdoorPlace } from "../weather/codes";
import type { WeatherForecast } from "../weather/types";
import {
  languageDisplayName,
  normalizeLanguage,
} from "../i18n/preference";

function languageNameForPrompt(code?: string): string {
  return languageDisplayName(normalizeLanguage(code));
}

export interface TripPreferencesInput {
  destination: string;
  startDate: string;
  endDate: string;
  interests: string[];
  intensity: "relaxed" | "balanced" | "packed";
  transport: string;
  mustSee: string[];
  /** Soft boosts — sought when filling days, not hard-required like mustSee. */
  preferred?: string[];
  avoid: string[];
  idealTrip: string;
  prefersHiddenGems?: boolean;
  budget?: number;
  budgetAllocation?: "sights" | "food" | "getting-around" | "mostly-free";
  restaurantStyle?: "street" | "casual" | "sit-down" | "mix";
  rejectedPlaceIds?: string[];
  keptPlaceIds?: string[];
  party?: TravelParty;
  interestWeights?: Record<string, number>;
  /** Interests the traveler repeatedly rejected — demote matching place types. */
  downrankedInterests?: string[];
  maxWalkMinutes?: number;
  indoorOutdoor?: SettingLean;
  dietary?: string;
  accessibility?: string;
  dayStart?: string;
  dayEnd?: string;
  hotel?: string;
  legs?: TripLeg[];
  inboundFlight?: {
    fromIata: string;
    toIata: string;
    toName?: string;
    estimatedArrivalLocal?: string;
    suggestedDayStart?: string;
    durationMinutes?: number;
    lat?: number;
    lng?: number;
    note?: string;
  };
  /** BCP-47-ish app language from settings (en, ja, …). */
  language?: string;
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
  /** True when the previous-leg minutes came from OSRM or Google, not an estimate. */
  travelRouted?: boolean;
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
  weatherSummary?: string;
  weatherWet?: boolean;
}

function isSitDown(types: string[]): boolean {
  return types.some((type) =>
    /restaurant|cafe|fast_food|bar|pub|food_court|biergarten/i.test(type),
  );
}

function isGenericName(name: string): boolean {
  return /^(food|restaurant|cafe|café|bar|pub|park|museum|attraction|shop|hotel|viewpoint)$/i.test(
    name.trim(),
  );
}

function interestMatch(
  types: string[],
  interests: string[],
  weights?: Record<string, number>,
): number {
  return weightedInterestMatch(types, interests, weights);
}

function dayCount(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

function localTripDate(start: string, dayIndex: number): Date {
  const [year, month, day] = start.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day + dayIndex);
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
  destinationContextBlock?: string,
  extra?: {
    dayPlan?: ReturnType<typeof expandLegsToDays>;
    hotelNotes?: string;
    weatherBlock?: string;
  },
): Promise<ItineraryGeneration | null> {
  // note: weatherBlock + personalization fields are passed through to the prompt below
  if (!process.env.GROQ_API_KEY) return null;
  const model = await plannerModel();
  const popConfig = getPopularityConfig();

  try {
    const raw = await groqChat({
    model,
    temperature: 0.4,
    effort: "medium",
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "ItineraryGeneration",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["days", "warnings"],
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
                        "planningNote",
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
      {
        role: "system",
        content: buildItinerarySystemPrompt(
          languageNameForPrompt(prefs.language),
        ),
      },
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
          preferred: prefs.preferred ?? [],
          avoid: prefs.avoid,
          idealTrip: prefs.idealTrip,
          candidates,
          popularityEnabled: popConfig.enabled,
          destinationContextBlock,
          dayPlan: extra?.dayPlan,
          hotelNotes: extra?.hotelNotes,
          weatherBlock: extra?.weatherBlock,
          interestWeights: prefs.interestWeights,
          party: prefs.party,
          dietary: prefs.dietary,
          indoorOutdoor: prefs.indoorOutdoor,
          maxWalkMinutes: prefs.maxWalkMinutes,
        }),
      },
    ],
  });

    if (!raw) return null;
    return itineraryGenerationSchema.parse(JSON.parse(raw));
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
  return fallbackScheduleMultiCity(
    prefs,
    candidates,
    expandLegsToDays([
      {
        city: prefs.destination,
        days: dayCount(prefs.startDate, prefs.endDate),
        hotel: prefs.hotel,
      },
    ]),
  );
}

function stopsPerDay(intensity: TripPreferencesInput["intensity"]): number {
  // Keep in sync with stopCap — every first plan should fill the day.
  return intensity === "packed" ? 5 : intensity === "relaxed" ? 3 : 4;
}

function fallbackScheduleMultiCity(
  prefs: TripPreferencesInput,
  candidates: RankedCandidate[],
  dayPlan: ReturnType<typeof expandLegsToDays>,
): ItineraryGeneration {
  const perDay = stopsPerDay(prefs.intensity);
  const used = new Set<string>();
  const must = prefs.mustSee ?? [];
  const soft = prefs.preferred ?? [];
  const result = [];
  for (const day of dayPlan) {
    const pool = candidates.filter(
      (c) =>
        (!c.city || c.city === day.city) && !used.has(c.placeId),
    );
    const activities: {
      placeId: string;
      startTime: string;
      durationMinutes: number;
      priority: "must_see" | "preferred" | "optional";
      planningNote: string;
    }[] = [];
    const take = (
      pick: RankedCandidate | undefined,
      priority: "must_see" | "preferred" | "optional",
      slot: number,
    ) => {
      if (!pick || activities.length >= perDay) return;
      used.add(pick.placeId);
      activities.push({
        placeId: pick.placeId,
        startTime: `${String(10 + slot * 2).padStart(2, "0")}:00`,
        durationMinutes: 90,
        priority,
        planningNote: `Scheduled in ${day.city}${day.hotel ? ` near ${day.hotel}` : ""}`,
      });
    };
    // Major stops first, then soft preferred, then fill from ranked pool.
    for (const name of must) {
      const hit = pool.find(
        (c) => !used.has(c.placeId) && nameMatchesStop(c.displayName, name),
      );
      take(hit, "must_see", activities.length);
    }
    for (const name of soft) {
      const hit = pool.find(
        (c) => !used.has(c.placeId) && nameMatchesStop(c.displayName, name),
      );
      take(hit, "preferred", activities.length);
    }
    const startSlot = day.isArrivalTransitDay ? Math.max(1, activities.length) : activities.length;
    for (let a = startSlot; a < perDay && activities.length < perDay; a++) {
      const pick = pool.find((c) => !used.has(c.placeId));
      take(pick, "preferred", activities.length);
    }
    result.push({ dayIndex: day.dayIndex, activities });
  }
  return { days: result };
}

/** Top up sparse model days so every dayPlan day has a full candidate slate. */
export function mergeSparseAiSchedule(input: {
  ai: ItineraryGeneration;
  fallback: ItineraryGeneration;
  dayPlan: ReturnType<typeof expandLegsToDays>;
  perDay: number;
}): ItineraryGeneration {
  const aiBy = new Map(input.ai.days.map((day) => [day.dayIndex, day]));
  const fbBy = new Map(input.fallback.days.map((day) => [day.dayIndex, day]));
  const used = new Set<string>();
  const days = input.dayPlan.map((assignment) => {
    const existing = aiBy.get(assignment.dayIndex)?.activities ?? [];
    const merged = [...existing];
    for (const act of existing) used.add(act.placeId);
    if (merged.length < input.perDay) {
      for (const extra of fbBy.get(assignment.dayIndex)?.activities ?? []) {
        if (merged.length >= input.perDay) break;
        if (used.has(extra.placeId)) continue;
        used.add(extra.placeId);
        merged.push(extra);
      }
    }
    return { dayIndex: assignment.dayIndex, activities: merged };
  });
  return {
    days,
    warnings: [
      ...(input.ai.warnings ?? []),
      ...(input.fallback.warnings ?? []),
    ],
  };
}

export async function generateItinerary(prefs: TripPreferencesInput): Promise<{
  days: GeneratedDay[];
  warnings: string[];
  popularityUsed: boolean;
}> {
  // Resolve multi-city legs (GeoNames + hotel pins) or single destination
  let legs: TripLeg[] =
    prefs.legs && prefs.legs.length
      ? prefs.legs
      : [
          {
            city: prefs.destination,
            days: dayCount(prefs.startDate, prefs.endDate),
            hotel: prefs.hotel,
          },
        ];
  legs = anchorUnbookedLegs(legs);
  legs = await resolveTripLegs(legs);
  if (!legs.length) {
    throw new Error("Could not resolve any trip cities.");
  }

  const dayPlan = expandLegsToDays(legs);
  const tripLabel = primaryDestinationLabel(legs);
  prefs = { ...prefs, destination: tripLabel };

  const primary = legs[0];
  const geo = {
    lat: primary.hotelLat ?? primary.lat!,
    lng: primary.hotelLng ?? primary.lng!,
    formatted: tripLabel,
  };
  if (primary.lat == null || primary.lng == null) {
    const fallback = await geocodeDestination(prefs.destination);
    if (!fallback) {
      throw new Error(
        "We couldn’t place that destination. Try the city again in a moment.",
      );
    }
    geo.lat = fallback.lat;
    geo.lng = fallback.lng;
  }

  let weatherForecast: WeatherForecast | null = null;
  try {
    weatherForecast = await fetchDailyWeather({
      lat: geo.lat,
      lng: geo.lng,
      startDate: prefs.startDate,
      endDate: prefs.endDate,
    });
  } catch (err) {
    logger.warn("weather_skipped", {
      error: err instanceof Error ? err.message : "unknown",
    });
  }
  const weatherBlock = weatherPromptBlock(weatherForecast);

  const popConfig = getPopularityConfig();
  let popularityMap = new Map<string, PopularitySignals>();
  if (popConfig.enabled) {
    try {
      popularityMap = await getPopularityForDestination({
        destination: legs[0].city,
        destinationLat: geo.lat,
        destinationLng: geo.lng,
      });
    } catch (err) {
      logger.warn("popularity_skipped", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  type Hit = {
    placeId: string;
    displayName: string;
    lat: number;
    lng: number;
    types: string[];
    formattedAddress?: string;
    wikipediaTitle?: string | null;
    city?: string;
    openingHours?: string;
    wheelchair?: string | null;
    fee?: string | null;
    cuisine?: string | null;
  };

  const byId = new Map<string, Hit>();
  const wikiByPlace = new Map<string, string | null>();
  const onlineInterest = new Map<string, OnlineInterestSignal>();
  let destinationContextBlock = "";

  // Discover candidates per unique city, anchored on hotel when available
  const uniqueCities = [...new Set(legs.map((l) => l.city))];
  for (const city of uniqueCities) {
    const leg = legs.find((l) => l.city === city)!;
    const centerLat = leg.hotelLat ?? leg.lat!;
    const centerLng = leg.hotelLng ?? leg.lng!;
    if (centerLat == null || centerLng == null) continue;

    try {
      const osmDiscovered = await discoverPlacesFromOsm({
        destination: city,
        lat: centerLat,
        lng: centerLng,
        radiusMeters: leg.hotel ? 4500 : 7000,
        limit: 36,
      });
      for (const h of discoveredToPlaceHits(osmDiscovered)) {
        byId.set(h.placeId, { ...h, city });
        wikiByPlace.set(h.placeId, h.wikipediaTitle ?? null);
      }
      const interest = await scorePlacesOnlineInterest(
        osmDiscovered.map((p) => ({
          placeId: p.placeId,
          wikipediaTitle: p.wikipediaTitle,
        })),
      );
      for (const [k, v] of interest) onlineInterest.set(k, v);
    } catch (err) {
      logger.warn("osm_discover_skipped", {
        city,
        error: err instanceof Error ? err.message : "unknown",
      });
    }

    try {
      const interestHits = await searchInterestPlaces({
        destination: city,
        centerLat,
        centerLng,
        interests: expandInterestQueries(prefs.interests),
      });
      for (const h of interestHits) {
        byId.set(h.placeId, { ...h, city });
      }
    } catch {
      /* soft */
    }

    try {
      const mustHits = await resolveMustSees(
        prefs.mustSee,
        city,
        centerLat,
        centerLng,
      );
      for (const h of mustHits) {
        byId.set(h.placeId, { ...h, city });
      }
    } catch {
      /* soft */
    }

    try {
      const preferredHits = await resolveMustSees(
        prefs.preferred ?? [],
        city,
        centerLat,
        centerLng,
      );
      for (const h of preferredHits) {
        if (!byId.has(h.placeId)) byId.set(h.placeId, { ...h, city });
      }
    } catch {
      /* soft */
    }

    try {
      const sortedCtx = await fetchSortedDestinationContext(city);
      const block = formatDestinationContextForPrompt(sortedCtx);
      if (block) {
        destinationContextBlock += `\n[${city}]\n${block}\n`;
      }
    } catch {
      /* omit */
    }
  }
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

  // Fold Wikimedia increasing interest into PopularitySignals for UI labels
  for (const [pid, signal] of onlineInterest) {
    if (signal.classification !== "increasing" || !signal.label) continue;
    if (!popularityMap.has(pid)) {
      popularityMap.set(pid, {
        placeId: pid,
        displayName: byId.get(pid)?.displayName ?? pid,
        score: 70,
        confidence: signal.confidence === "high" ? 0.85 : 0.6,
        trend: "rising",
        label: "gaining_attention",
        sources: ["wikimedia_pageviews"],
        attributionUrls: signal.wikipediaTitle
          ? [
              `https://en.wikipedia.org/wiki/${encodeURIComponent(signal.wikipediaTitle)}`,
            ]
          : [],
        retrievedAt: new Date(signal.retrievedAt),
      });
    }
  }

  const candidatesRaw = [...byId.values()].map((c) => {
    const leg =
      legs.find((l) => l.city === c.city) ??
      legs[0];
    const anchorLat = leg.hotelLat ?? leg.lat ?? geo.lat;
    const anchorLng = leg.hotelLng ?? leg.lng ?? geo.lng;
    const rel = interestMatch(c.types, prefs.interests, prefs.interestWeights);
    const geoFit =
      1 -
      Math.min(
        1,
        Math.hypot(c.lat - anchorLat, c.lng - anchorLng) / 0.35,
      );
    const wiki =
      c.wikipediaTitle ?? wikiByPlace.get(c.placeId) ?? null;
    const quality = placeQualityScore({
      hasAddress: Boolean(c.formattedAddress),
      hasWikipedia: Boolean(wiki),
      tagCount: c.types.length,
    });
    const interest = onlineInterest.get(c.placeId) ?? null;
    const rejected = new Set(
      (prefs.rejectedPlaceIds ?? []).map((id) => id.toLowerCase()),
    );
    const kept = new Set((prefs.keptPlaceIds ?? []).map((id) => id.toLowerCase()));
    let discoveryRank =
      combineDiscoveryRank({
        relevance: rel,
        geography: geoFit,
        quality,
        interest,
        prefersHiddenGems: Boolean(prefs.prefersHiddenGems),
        budget: budgetFitScore({
          types: c.types,
          allocation: prefs.budgetAllocation,
          restaurantStyle: prefs.restaurantStyle,
        }),
        pace: paceFitScore({ types: c.types, intensity: prefs.intensity }),
      }) + (c.openingHours ? 0.04 : 0);
    if (rejected.has(c.placeId.toLowerCase()) || rejected.has(c.displayName.toLowerCase())) {
      discoveryRank *= 0.2;
    }
    if (kept.has(c.placeId.toLowerCase()) || kept.has(c.displayName.toLowerCase())) {
      discoveryRank += 0.35;
    }
    if ((prefs.mustSee ?? []).some((stop) => nameMatchesStop(c.displayName, stop))) {
      discoveryRank += 0.55;
    } else if (
      (prefs.preferred ?? []).some((stop) => nameMatchesStop(c.displayName, stop))
    ) {
      discoveryRank += 0.28;
    }
    discoveryRank *= 0.7 + 0.3 * partyFit(c.types, prefs.party);
    discoveryRank *= 0.75 + 0.25 * settingFit(c.types, prefs.indoorOutdoor);
    if (cuisineConflicts(prefs.dietary, c.cuisine)) discoveryRank *= 0.25;
    const down = prefs.downrankedInterests ?? [];
    if (down.length) {
      const blob = c.types.join(" ").toLowerCase();
      const hit = down.some((interest) =>
        interestSynonyms(interest).some((token) => blob.includes(token)),
      );
      if (hit) discoveryRank *= 0.55;
    }
    return {
      placeId: c.placeId,
      displayName: c.displayName,
      types: c.types,
      lat: c.lat,
      lng: c.lng,
      city: c.city,
      openingHours: c.openingHours,
      interestMatch: rel,
      geoFit,
      discoveryRank,
    };
  });

  // Blend legacy popularity rank with discovery rank (discovery primary)
  const legacyRanked = rankCandidatesWithPopularity({
    candidates: candidatesRaw,
    popularityByPlaceId: popularityMap,
    prefersHiddenGems: Boolean(prefs.prefersHiddenGems),
  });

  const ranked: RankedCandidate[] = legacyRanked
    .map((c) => {
      const raw = candidatesRaw.find((r) => r.placeId === c.placeId);
      const discovery = raw?.discoveryRank ?? c.combinedRank;
      return {
        ...c,
        city: raw?.city ?? c.city,
        openingHours: raw?.openingHours,
        combinedRank: 0.7 * discovery + 0.3 * c.combinedRank,
      };
    })
    .sort((a, b) => {
      const generic =
        Number(isGenericName(a.displayName)) - Number(isGenericName(b.displayName));
      if (generic !== 0) return generic;
      return b.combinedRank - a.combinedRank;
    });

  const filtered = ranked.filter((c) => !nameIsAvoided(c.displayName, prefs.avoid));

  const hotelNotes = legs
    .map((l) => {
      if (!l.hotel) {
        return l.hotelBooked === false
          ? `• ${l.city}: hotel not booked and no HotelRec match — using city center`
          : `• ${l.city}: no hotel set — using city center`;
      }
      if (l.hotelBooked === false) {
        return `• ${l.city}: hotel not booked — anchored on HotelRec suggestion "${l.hotel}"${l.hotelAddress ? ` (${l.hotelAddress})` : ""}. Do not invent a different hotel or any review quotes.`;
      }
      const pinned =
        l.hotelLat != null
          ? `resolved near ${l.hotelAddress ?? "coordinates"}`
          : "name provided (pin unresolved — still prefer named OSM places nearby)";
      return `• ${l.city}: hotel "${l.hotel}" (${pinned})`;
    })
    .join("\n");

  const deterministic = fallbackScheduleMultiCity(prefs, filtered, dayPlan);
  let ai = await callGroq(
    prefs,
    filtered,
    destinationContextBlock || undefined,
    { dayPlan, hotelNotes, weatherBlock: weatherBlock || undefined },
  );
  let modelUnavailable = false;
  if (!ai) {
    ai = deterministic;
    modelUnavailable = true;
  } else {
    // Models often return only day 0 with a single stop — top up from the
    // deterministic slate so later days and full days still get places.
    ai = mergeSparseAiSchedule({
      ai,
      fallback: deterministic,
      dayPlan,
      perDay: stopsPerDay(prefs.intensity),
    });
  }

  const warnings = ai.warnings ?? [];
  if (modelUnavailable) {
    warnings.push(
      "The model was unavailable, so this plan was built from the researched places.",
    );
  }
  const allowedPlaceIds = new Set(byId.keys());
  const placeCity = new Map(
    [...byId.entries()].map(([id, hit]) => [id, hit.city] as const),
  );
  ai = {
    ...ai,
    days: ai.days.map((day) => {
      const assignment = dayPlan.find((row) => row.dayIndex === day.dayIndex);
      const validated = validateAiDay({
        dayIndex: day.dayIndex,
        activities: day.activities,
        allowedPlaceIds,
        placeCity,
        dayCity: assignment?.city,
      });
      warnings.push(...validated.warnings);
      const byPlace = new Map(day.activities.map((row) => [row.placeId, row]));
      return {
        ...day,
        activities: validated.kept
          .map((row) => byPlace.get(row.placeId))
          .filter(Boolean) as typeof day.activities,
      };
    }),
  };
  if (weatherForecast?.days.some((day) => day.wet)) {
    warnings.push(
      "Wet-weather days will prefer indoor stops; outdoor parks and viewpoints are deferred when the forecast looks rainy.",
    );
  } else if (!weatherForecast) {
    warnings.push(
      "Live weather was unavailable for these dates, so outdoor/indoor balance followed traveler preferences only.",
    );
  }
  const detailsCache = new Map<string, Awaited<ReturnType<typeof getPlaceDetails>>>();

  const routeMode =
    prefs.transport === "driving"
      ? "DRIVE"
      : prefs.transport === "transit"
        ? "TRANSIT"
        : "WALK";

  const days: GeneratedDay[] = [];
  const usedAcross = new Set<string>();
  // Prefer AI days aligned to dayPlan length
  const aiByIndex = new Map(ai.days.map((d) => [d.dayIndex, d]));

  for (const assignment of dayPlan) {
    const day =
      aiByIndex.get(assignment.dayIndex) ??
      ({ dayIndex: assignment.dayIndex, activities: [] } as (typeof ai.days)[0]);

    const dayActs = day.activities.filter((a) => {
      if (!byId.has(a.placeId)) return false;
      const hit = byId.get(a.placeId)!;
      // Keep activities in the day's city when tagged
      if (hit.city && hit.city !== assignment.city) return false;
      return true;
    });

    const leg = legs[assignment.legIndex] ?? legs[0];
    const startPt = {
      lat: leg.hotelLat ?? leg.lat ?? geo.lat,
      lng: leg.hotelLng ?? leg.lng ?? geo.lng,
    };

    const orderedIds = await orderByRoutedNeighbor(
      dayActs.map((a) => {
        const b = byId.get(a.placeId)!;
        return { ...a, lat: b.lat, lng: b.lng, placeId: a.placeId };
      }),
      startPt,
      routeMode,
    );

    const activities: GeneratedActivity[] = [];
    const defaultStart =
      assignment.dayIndex === 0
        ? (prefs.inboundFlight?.suggestedDayStart ??
          prefs.dayStart ??
          "09:00")
        : assignment.isArrivalTransitDay
          ? "14:00"
          : (prefs.dayStart ?? "09:00");
    let cursorTime = defaultStart.slice(0, 5);
    if (assignment.dayIndex === 0 && prefs.inboundFlight?.toIata) {
      const arr =
        prefs.inboundFlight.estimatedArrivalLocal?.slice(0, 5) ?? cursorTime;
      const airportName =
        prefs.inboundFlight.toName ??
        `${prefs.inboundFlight.toIata} Airport`;
      activities.push({
        placeId: `flight:arrive:${prefs.inboundFlight.toIata}`,
        name: `Arrive · ${airportName}`,
        address: `${prefs.inboundFlight.fromIata} → ${prefs.inboundFlight.toIata}`,
        lat: prefs.inboundFlight.lat ?? geo.lat,
        lng: prefs.inboundFlight.lng ?? geo.lng,
        startTime: arr,
        durationMinutes: 60,
        priority: "must_see",
        planningNote: `Estimated landing around ${arr} local. Plan on about ${prefs.inboundFlight.durationMinutes ?? "a few hours"} in the air, then baggage and customs. First stop around ${cursorTime}. ${prefs.inboundFlight.note ?? ""}`.trim(),
        hoursVerified: false,
        scheduleWarnings: [
          "Flight times are estimates. Check your airline before you travel.",
        ],
        travelMinutesFromPrev: 0,
      });
      cursorTime = defaultStart.slice(0, 5);
    }

    // Intercity transit: flight / major train / ferry / coach / car with timed window
    if (assignment.isArrivalTransitDay && assignment.previousCity) {
      const prevLeg = legs[assignment.legIndex - 1];
      const transit = await planIntercityTransit({
        fromCity: assignment.previousCity,
        toCity: assignment.city,
        fromLat: prevLeg?.hotelLat ?? prevLeg?.lat,
        fromLng: prevLeg?.hotelLng ?? prevLeg?.lng,
        toLat: leg.hotelLat ?? leg.lat,
        toLng: leg.hotelLng ?? leg.lng,
        fromHotel: prevLeg?.hotel,
        toHotel: leg.hotel,
        preferredLocalTransport: prefs.transport,
        preferredMode: leg.transitFromPrevious ?? "auto",
        model: await plannerModel(),
      });
      activities.push({
        placeId: transit.placeId,
        name: transit.name,
        address: transit.address,
        lat: startPt.lat,
        lng: startPt.lng,
        startTime: transit.departLocal,
        durationMinutes: Math.min(transit.durationMinutes, 16 * 60),
        priority: "must_see",
        planningNote: `${transit.planningNote} Trip legs: ${legsLabel(legs)}. Then plan around ${leg.hotel ? `hotel “${leg.hotel}”` : `${assignment.city} center`}.`,
        hoursVerified: false,
        scheduleWarnings: transit.scheduleWarnings,
        travelMinutesFromPrev: 0,
      });
      cursorTime = addMinutes(
        transit.departLocal,
        Math.min(transit.durationMinutes, 16 * 60),
      );
      // Leave a short buffer before sightseeing after arrival
      cursorTime = addMinutes(cursorTime, 30);
    }

    const dayDate = localTripDate(prefs.startDate, assignment.dayIndex);
    const dayWeather = weatherForDate(weatherForecast, dayDate);
    const dayWet = Boolean(dayWeather?.wet);
    const dayEnd = (prefs.dayEnd ?? "21:00").slice(0, 5);
    const usedPlaces = new Set<string>();

    const placeOne = async (
      placeId: string,
      durationMinutes: number,
      priority: GeneratedActivity["priority"],
      planningNote: string | undefined,
      requireKnownHours: boolean,
    ) => {
      if (usedAcross.has(placeId) || usedPlaces.has(placeId) || !byId.has(placeId)) return false;
      const candidate = byId.get(placeId)!;
      if (
        dayWet &&
        priority !== "must_see" &&
        isOutdoorPlace(candidate.types, candidate.displayName)
      ) {
        return false;
      }
      if (!detailsCache.has(placeId)) {
        detailsCache.set(placeId, await getPlaceDetails(placeId));
      }
      const details = detailsCache.get(placeId);
      const base = byId.get(placeId)!;
      const published =
        (details?.regularOpeningHours as { osmOpeningHours?: string } | undefined)
          ?.osmOpeningHours ??
        base.openingHours ??
        details?.regularOpeningHours;
      const fit = fitVisit({
        openingHours: published,
        cursor: cursorTime,
        durationMinutes,
        dayDate,
        dayEnd,
      });
      if (fit.status === "closed") {
        warnings.push(`${details?.displayName ?? base.displayName}: ${fit.reason}`);
        usedPlaces.add(placeId);
        return false;
      }
      if (requireKnownHours && fit.status !== "open") return false;
      const startTime = fit.status === "open" ? fit.start : cursorTime;
      const scheduleWarnings: string[] = [];
      let note = planningNote ?? "";
      if (fit.status === "open") {
        const moved = fit.moved
          ? `Moved to ${fit.start} so the visit sits inside published hours. `
          : "";
        const listedBy =
          typeof published === "string" || base.openingHours
            ? "OpenStreetMap"
            : "the place listing";
        note = `${moved}Hours from ${listedBy}: ${fit.source}. This visit uses ${fit.window}. ${note}`.trim();
      } else {
        scheduleWarnings.push(
          "Opening hours are not listed, so this time is not confirmed.",
        );
      }
      const pop = popularityMap.get(placeId);
      const label = pop && pop.label ? popularityLabelText(pop.label) : null;
      activities.push({
        placeId,
        name: details?.displayName ?? base.displayName,
        address: details?.formattedAddress ?? base.formattedAddress,
        lat: details?.lat ?? base.lat,
        lng: details?.lng ?? base.lng,
        startTime,
        durationMinutes,
        priority,
        planningNote: note || undefined,
        hoursVerified: fit.status === "open",
        websiteUri: details?.websiteUri,
        googleMapsUri: details?.googleMapsUri,
        photoName: details?.photoName,
        openingHours: fit.status === "open" ? fit.window : undefined,
        popularityLabel: label,
        popularitySources: pop?.sources,
        popularityAttributionUrls: pop?.attributionUrls,
        scheduleWarnings,
        travelMinutesFromPrev: 0,
      });
      usedPlaces.add(placeId);
      // Defer usedAcross until the day is finalized — hours/variety filters may
      // drop this stop, and burning the id early leaves later days empty.
      cursorTime = addMinutes(startTime, durationMinutes + 15);
      return true;
    };

    for (const act of orderedIds) {
      if (!byId.has(act.placeId)) {
        warnings.push(`Dropped unknown placeId ${act.placeId}`);
        continue;
      }
      await placeOne(
        act.placeId,
        act.durationMinutes,
        act.priority,
        act.planningNote,
        false,
      );
    }

    const target = stopCap({
      intensity: prefs.intensity,
      party: prefs.party,
      tightBudget:
        prefs.budgetAllocation === "mostly-free" ||
        (typeof prefs.budget === "number" && prefs.budget > 0 && prefs.budget < 800),
    });
    const sightseeing = () =>
      activities.filter(
        (item) =>
          !item.placeId.startsWith("transit:") &&
          !item.placeId.startsWith("flight:"),
      ).length;
    const cityPool = filtered.filter(
      (candidate) =>
        (candidate.city ?? assignment.city) === assignment.city &&
        !usedAcross.has(candidate.placeId),
    );
    // Lock major stops into the day before filling the rest from interests.
    for (const stop of prefs.mustSee ?? []) {
      if (sightseeing() >= target) break;
      const hit = cityPool.find(
        (candidate) =>
          !usedAcross.has(candidate.placeId) &&
          nameMatchesStop(candidate.displayName, stop),
      );
      if (hit) {
        await placeOne(hit.placeId, 105, "must_see", `Major stop: ${stop}`, false);
      }
    }
    for (const stop of prefs.preferred ?? []) {
      if (sightseeing() >= target) break;
      const hit = cityPool.find(
        (candidate) =>
          !usedAcross.has(candidate.placeId) &&
          nameMatchesStop(candidate.displayName, stop),
      );
      if (hit) {
        await placeOne(hit.placeId, 90, "preferred", `Preferred stop: ${stop}`, false);
      }
    }
    const indoorFirst = dayWet
      ? [
          ...cityPool.filter(
            (candidate) =>
              !isOutdoorPlace(candidate.types, candidate.displayName) &&
              !isSitDown(candidate.types),
          ),
          ...cityPool.filter((candidate) => isSitDown(candidate.types)),
          ...cityPool.filter((candidate) =>
            isOutdoorPlace(candidate.types, candidate.displayName),
          ),
        ]
      : [
          ...cityPool.filter((candidate) => !isSitDown(candidate.types)),
          ...cityPool.filter((candidate) => isSitDown(candidate.types)),
        ];
    for (const candidate of indoorFirst) {
      if (sightseeing() >= target) break;
      await placeOne(
        candidate.placeId,
        isSitDown(candidate.types) ? 75 : 90,
        "preferred",
        dayWet && !isOutdoorPlace(candidate.types, candidate.displayName)
          ? "Indoor pick for a wet-weather day."
          : undefined,
        false,
      );
    }
    // If wet-weather filtering left the day empty, allow outdoor fills with a warning.
    if (dayWet && sightseeing() === 0) {
      warnings.push(
        `Day ${assignment.dayIndex + 1} is wet, but few indoor OpenStreetMap places were listed — outdoor stops were kept as a fallback.`,
      );
      for (const candidate of cityPool) {
        if (sightseeing() >= target) break;
        if (!isOutdoorPlace(candidate.types, candidate.displayName)) continue;
        const hit = byId.get(candidate.placeId);
        if (!hit || usedAcross.has(candidate.placeId)) continue;
        // Bypass the wet outdoor skip inside placeOne by treating as must_see fallback.
        await placeOne(
          candidate.placeId,
          isSitDown(candidate.types) ? 75 : 90,
          "must_see",
          "Outdoor fallback — few indoor places were listed for this wet day.",
          false,
        );
      }
    }
    if (sightseeing() === 0) {
      warnings.push(
        `No OpenStreetMap places were available to schedule in ${assignment.city} on day ${assignment.dayIndex + 1}.`,
      );
    }

    // Re-order sightseeing geographically after fills (keeps transit/flight anchors first).
    const anchoredActs = activities.filter(
      (a) => a.placeId.startsWith("transit:") || a.placeId.startsWith("flight:"),
    );
    const sightActs = activities.filter(
      (a) => !a.placeId.startsWith("transit:") && !a.placeId.startsWith("flight:"),
    );
    if (sightActs.length > 1) {
      const reordered = await orderByRoutedNeighbor(sightActs, startPt, routeMode);
      // Prefer variety: soft demote consecutive same experience buckets after geo order.
      const variedOrder: typeof reordered = [];
      const leftover = [...reordered];
      let prevBucket = "";
      while (leftover.length) {
        let pick = 0;
        for (let i = 0; i < leftover.length; i++) {
          const types = byId.get(leftover[i].placeId)?.types ?? [];
          const bucket = experienceBucket(types, leftover[i].name);
          if (bucket !== prevBucket || leftover[i].priority === "must_see") {
            pick = i;
            break;
          }
        }
        const next = leftover.splice(pick, 1)[0];
        prevBucket = experienceBucket(
          byId.get(next.placeId)?.types ?? [],
          next.name,
        );
        variedOrder.push(next);
      }
      activities.length = 0;
      activities.push(...anchoredActs, ...variedOrder);
      let cursor = defaultStart.slice(0, 5);
      if (anchoredActs.length) {
        const lastAnchor = anchoredActs[anchoredActs.length - 1];
        cursor = addMinutes(lastAnchor.startTime, lastAnchor.durationMinutes + 30);
      }
      for (const stop of variedOrder) {
        stop.startTime = cursor;
        cursor = addMinutes(cursor, stop.durationMinutes + 15);
      }
    }

    // Route local sightseeing legs; keep intercity transit duration as estimated
    const localStartIdx = activities.findIndex(
      (a) => !a.placeId.startsWith("transit:") && !a.placeId.startsWith("flight:"),
    );
    const routePoints = activities
      .slice(Math.max(0, localStartIdx))
      .map((a) => ({ lat: a.lat, lng: a.lng }));
    const route = await computeDayRoute({
      mode: routeMode,
      points:
        routePoints.length >= 2
          ? routePoints
          : activities.map((a) => ({ lat: a.lat, lng: a.lng })),
    });
    if (route && localStartIdx >= 0) {
      if (route.source === "estimate") {
        warnings.push(
          "Some walking/driving times used a path estimate — live routing was unavailable. Times still include a detour buffer (not crow-flies across rivers).",
        );
      }
      for (let i = localStartIdx + 1; i < activities.length; i++) {
        const routeLeg = route.legs[i - localStartIdx - 1];
        const travel = routeLeg?.durationMinutes ?? 0;
        activities[i].travelMinutesFromPrev = travel;
        activities[i].travelRouted = route.source === "osrm" || route.source === "google";
        if (travel > 45) {
          warnings.push(
            `Long transfer (${travel} min) before ${activities[i].name} — likely a real-path detour (bridge, one-way, or sparse paths), not crow-flies distance.`,
          );
        }
        // Flag when routed path is much longer than straight line (river banks, etc.)
        if (
          routeLeg?.routed &&
          activities[i - 1].lat != null &&
          activities[i].lat != null
        ) {
          const straightKm = haversineKm(
            activities[i - 1].lat,
            activities[i - 1].lng,
            activities[i].lat,
            activities[i].lng,
          );
          const routedKm = (routeLeg.distanceMeters ?? 0) / 1000;
          if (straightKm > 0.05 && routedKm / straightKm >= 2.2) {
            activities[i].scheduleWarnings = [
              ...(activities[i].scheduleWarnings ?? []),
              `Path is ~${Math.round(routedKm / straightKm)}× longer than straight-line (${Math.round(routedKm * 1000)} m vs ${Math.round(straightKm * 1000)} m) — expect bridges/detours.`,
            ];
          }
        }
      }
    }

    const clocked = fitDayClock(
      activities.map((activity) => {
        const details = detailsCache.get(activity.placeId);
        const rawHours =
          details && "regularOpeningHours" in (details as object)
            ? (details as { regularOpeningHours?: unknown }).regularOpeningHours
            : activity.openingHours;
        return {
          ...activity,
          hoursWindow:
            typeof activity.openingHours === "string" ? activity.openingHours : null,
          openingHours: rawHours ?? activity.openingHours,
          dayDate,
          types: byId.get(activity.placeId)?.types ?? [],
        };
      }),
      {
        dayEnd,
        mealGapMinutes: 60,
        isMeal: (item) => isSitDown(item.types),
        anchored: (item) =>
          item.placeId.startsWith("flight:") || item.placeId.startsWith("transit:"),
      },
    );
    for (const drop of clocked.dropped) warnings.push(drop.reason);
    const varied = dropRepeatedExperiences(clocked.kept, {
      minSightseeing: Math.min(target, 3),
    });
    if (varied.dropped.length) {
      warnings.push("A repeated kind of stop was left off so the day is not two of the same experience.");
    }
    const scheduled = varied.kept.map((activity, index) => {
      const previous = [...varied.kept.slice(0, index)]
        .reverse()
        .find(
          (item) =>
            !item.placeId.startsWith("flight:") && !item.placeId.startsWith("transit:"),
        );
      if (
        activity.placeId.startsWith("flight:") ||
        activity.placeId.startsWith("transit:") ||
        !noteIsGeneric(activity.planningNote)
      ) {
        return activity;
      }
      const hoursWindow =
        typeof activity.openingHours === "string" ? activity.openingHours : undefined;
      return {
        ...activity,
        planningNote: explainStop({
          name: activity.name,
          types: activity.types,
          city: assignment.city,
          previousName: previous?.name,
          hours: activity.hoursVerified ? "open" : "unknown",
          hoursWindow,
        }),
      };
    });

    const constrained = applyDayConstraints(
      scheduled.map((activity) => ({
        ...activity,
        types: activity.types ?? byId.get(activity.placeId)?.types ?? [],
        wheelchair: byId.get(activity.placeId)?.wheelchair,
        fee: byId.get(activity.placeId)?.fee,
        cuisine: byId.get(activity.placeId)?.cuisine,
      })),
      {
        maxWalkMinutes: prefs.maxWalkMinutes,
        walking: prefs.transport !== "driving" && prefs.transport !== "transit",
        stepFree: wantsStepFree(prefs.accessibility),
        dietary: prefs.dietary,
        wetWeather: dayWet,
        isOutdoor: (stop) => isOutdoorPlace(stop.types, stop.name),
        isMustSee: (stop) => stop.priority === "must_see",
        transit: scheduled
          .filter((activity) => activity.placeId.startsWith("transit:"))
          .map((activity) => ({
            start: activity.startTime,
            durationMinutes: activity.durationMinutes,
          })),
      },
    );
    for (const drop of constrained.dropped) warnings.push(drop.reason);
    let finished = constrained.kept.map((activity) => {
      const note = constrained.notes[activity.placeId];
      const extra = [note?.fee, note?.access, note?.cuisine].filter(Boolean).join(" ");
      const estimateWalk =
        prefs.maxWalkMinutes &&
        !activity.travelRouted &&
        (activity.travelMinutesFromPrev ?? 0) > prefs.maxWalkMinutes
          ? ["Walk time is an estimate, so it was not used as a hard limit."]
          : [];
      return {
        ...activity,
        planningNote: extra ? `${activity.planningNote ?? ""} ${extra}`.trim() : activity.planningNote,
        scheduleWarnings: [...(activity.scheduleWarnings ?? []), ...estimateWalk],
      };
    });

    // Guarantee a full first plan: hours/constraint filters can gut a day —
    // top up from remaining researched places so every day has real stops.
    const finishedSightseeing = () =>
      finished.filter(
        (item) =>
          !item.placeId.startsWith("transit:") &&
          !item.placeId.startsWith("flight:"),
      ).length;
    if (finishedSightseeing() < target) {
      const already = new Set(finished.map((item) => item.placeId));
      let cursor =
        finished.length > 0
          ? addMinutes(
              finished[finished.length - 1].startTime,
              finished[finished.length - 1].durationMinutes + 15,
            )
          : defaultStart.slice(0, 5);
      const refillPool = [
        ...cityPool.filter((c) => !already.has(c.placeId) && !usedAcross.has(c.placeId)),
        ...filtered.filter(
          (c) =>
            !already.has(c.placeId) &&
            !usedAcross.has(c.placeId) &&
            (!c.city || c.city === assignment.city),
        ),
      ];
      const seenRefill = new Set<string>();
      for (const candidate of refillPool) {
        if (finishedSightseeing() >= target) break;
        if (seenRefill.has(candidate.placeId)) continue;
        seenRefill.add(candidate.placeId);
        const hit = byId.get(candidate.placeId);
        if (!hit) continue;
        finished.push({
          placeId: candidate.placeId,
          name: hit.displayName,
          address: hit.formattedAddress,
          lat: hit.lat,
          lng: hit.lng,
          startTime: cursor,
          durationMinutes: isSitDown(candidate.types) ? 75 : 90,
          priority: "preferred",
          planningNote: `Filled so day ${assignment.dayIndex + 1} in ${assignment.city} stays complete.`,
          hoursVerified: false,
          scheduleWarnings: [
            "Added to keep this day full after filtering — confirm hours before you go.",
          ],
          travelMinutesFromPrev: 0,
          types: candidate.types ?? [],
          wheelchair: hit.wheelchair,
          fee: hit.fee,
          cuisine: hit.cuisine,
          hoursWindow: null,
          openingHours: undefined,
          dayDate,
        } as (typeof finished)[number]);
        already.add(candidate.placeId);
        cursor = addMinutes(cursor, (isSitDown(candidate.types) ? 75 : 90) + 15);
      }
      if (finishedSightseeing() < target) {
        warnings.push(
          `Day ${assignment.dayIndex + 1} in ${assignment.city} still has only ${finishedSightseeing()} stops — the place list for this city was thin.`,
        );
      }
    }

    if (dayWeather) {
      warnings.push(
        `Day ${assignment.dayIndex + 1} weather: ${formatWeatherLine(dayWeather)}.`,
      );
    }

    for (const act of finished) {
      if (
        act.placeId.startsWith("flight:") ||
        act.placeId.startsWith("transit:")
      ) {
        continue;
      }
      usedAcross.add(act.placeId);
    }

    days.push({
      dayIndex: assignment.dayIndex,
      activities: finished,
      totalTravelMinutes: route?.totalDurationMinutes,
      totalWalkMeters:
        routeMode === "WALK" ? route?.totalDistanceMeters : undefined,
      routePolyline: route?.polyline,
      weatherSummary: dayWeather ? formatWeatherLine(dayWeather) : undefined,
      weatherWet: dayWet,
    });
  }

  warnings.push(...missingMustSees(prefs.mustSee, days.flatMap((day) => day.activities.map((activity) => activity.name))));

  return {
    days,
    warnings,
    popularityUsed: popConfig.enabled && popularityMap.size > 0,
  };
}
