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
  assignDayNeighborhoodSeeds,
  centroidOf,
  filterActsToNeighborhood,
  neighborhoodPool,
  sameDayRadiusKm,
  varietyPickIndex,
} from "./day-neighborhood";
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
  knownParkAsHit,
  knownParkPlaceId,
  matchKnownPark,
  parkDayAssignmentsFromText,
  withinCityRadiusKm,
} from "../trips/known-parks";
import {
  assignDayClusters,
  catalogPlaceId,
  enrichedParkNote,
  getLandmarksForCluster,
  getLandmarksForDestination,
  isTokyo,
  landmarkAsHit,
  matchLandmarkByName,
  type KnownLandmark,
  type NeighborhoodCluster,
} from "../trips/known-landmarks";
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
  /** Restaurant reservations from pasted confirmations — pinned onto the calendar. */
  bookedRestaurants?: {
    name: string;
    date?: string | null;
    time?: string | null;
    city?: string | null;
  }[];
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
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2 || /^\d+$/.test(trimmed)) return true;
  if (
    /^(food|restaurant|cafe|café|bar|pub|park|museum|attraction|shop|hotel|viewpoint)$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  // Administrative / non-tourist fillers that polluted Tokyo days.
  if (/区$/.test(trimmed) && trimmed.length <= 6) return true;
  if (/省$|庁$|ministry of|ward office|prefectur/i.test(trimmed)) return true;
  return false;
}

function isLowValueCandidate(hit: {
  displayName: string;
  types?: string[];
}): boolean {
  if (isGenericName(hit.displayName)) return true;
  const blob = (hit.types ?? []).join(" ").toLowerCase();
  if (
    /\b(government|townhall|administrative|suburb|neighbourhood|boundary|office)\b/.test(
      blob,
    )
  ) {
    return true;
  }
  return false;
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

function isBookingAnchorPlaceId(placeId: string): boolean {
  return (
    placeId.startsWith("flight:") ||
    placeId.startsWith("transit:") ||
    placeId.startsWith("hotel:") ||
    placeId.startsWith("restaurant:booked:") ||
    placeId.startsWith("park:")
  );
}

/** PlaceIds that are curated and should skip Nominatim detail lookups. */
function isCuratedPlaceId(placeId: string): boolean {
  return placeId.startsWith("park:") || placeId.startsWith("catalog:");
}

async function resolveMustSees(
  names: string[],
  destination: string,
  lat: number,
  lng: number,
) {
  const hits = [];
  const maxKm = Math.max(45, 40000 / 1000);
  for (const name of names.slice(0, 8)) {
    const known = matchKnownPark(name, destination);
    if (known) {
      hits.push(knownParkAsHit(known, destination));
      continue;
    }
    const hit = await textSearchPlace({
      query: `${name} ${destination}`,
      centerLat: lat,
      centerLng: lng,
      radiusMeters: 45000,
    });
    if (
      hit &&
      withinCityRadiusKm(hit.lat, hit.lng, { lat, lng }, maxKm) &&
      !isLowValueCandidate(hit)
    ) {
      hits.push(hit);
    }
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
          stopsPerDay: sightseeingStopsTarget(prefs),
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

function sightseeingStopsTarget(prefs: TripPreferencesInput): number {
  return stopCap({
    intensity: prefs.intensity,
    party: prefs.party,
    tightBudget:
      prefs.budgetAllocation === "mostly-free" ||
      (typeof prefs.budget === "number" && prefs.budget > 0 && prefs.budget < 800),
  });
}

function fallbackScheduleMultiCity(
  prefs: TripPreferencesInput,
  candidates: RankedCandidate[],
  dayPlan: ReturnType<typeof expandLegsToDays>,
): ItineraryGeneration {
  const perDay = sightseeingStopsTarget(prefs);
  const used = new Set<string>();
  const must = prefs.mustSee ?? [];
  const soft = prefs.preferred ?? [];
  const radiusKm = sameDayRadiusKm(prefs.transport, prefs.maxWalkMinutes);
  const hotelByCity = new Map<string, { lat: number; lng: number }>();
  for (const day of dayPlan) {
    if (hotelByCity.has(day.city)) continue;
    const nearHotel = candidates.find(
      (c) =>
        (!c.city || c.city === day.city) &&
        Number.isFinite(c.lat) &&
        Number.isFinite(c.lng),
    );
    if (nearHotel) {
      hotelByCity.set(day.city, { lat: nearHotel.lat, lng: nearHotel.lng });
    }
  }
  const seeds = assignDayNeighborhoodSeeds(
    dayPlan,
    candidates.map((c) => ({
      placeId: c.placeId,
      lat: c.lat,
      lng: c.lng,
      rank: c.combinedRank,
      city: c.city,
    })),
    hotelByCity,
  );
  const result = [];
  for (const day of dayPlan) {
    const cityPool = candidates.filter(
      (c) =>
        (!c.city || c.city === day.city) && !used.has(c.placeId),
    );
    const seed =
      seeds.get(day.dayIndex) ??
      (cityPool[0]
        ? { lat: cityPool[0].lat, lng: cityPool[0].lng }
        : null);
    const pool = seed
      ? neighborhoodPool(cityPool, seed, radiusKm, perDay)
      : cityPool;
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
        planningNote: `Scheduled in ${day.city}${day.hotel ? ` near ${day.hotel}` : ""} · same-area day`,
      });
    };
    // Major stops: only pull into this day when they sit near today's neighborhood.
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
  const stopsNeeded =
    dayPlan.length * sightseeingStopsTarget(prefs) + Math.max(8, dayPlan.length * 2);
  for (const city of uniqueCities) {
    const leg = legs.find((l) => l.city === city)!;
    const centerLat = leg.hotelLat ?? leg.lat!;
    const centerLng = leg.hotelLng ?? leg.lng!;
    if (centerLat == null || centerLng == null) continue;
    const cityDays = dayPlan.filter((d) => d.city === city).length;
    const discoverLimit = Math.min(96, Math.max(48, cityDays * sightseeingStopsTarget(prefs) * 3));

    try {
      const hotelPinned = Boolean(leg.hotel?.trim());
      let osmDiscovered = await discoverPlacesFromOsm({
        destination: city,
        lat: centerLat,
        lng: centerLng,
        // Booked hotel → keep discovery tight so days stay walkable from the stay.
        radiusMeters: hotelPinned ? 4200 : 9000,
        limit: discoverLimit,
      });
      // Thin Overpass response — widen the search once (still hotel-biased).
      if (osmDiscovered.length < Math.min(20, stopsNeeded)) {
        const wider = await discoverPlacesFromOsm({
          destination: city,
          lat: centerLat,
          lng: centerLng,
          radiusMeters: hotelPinned ? 8000 : 14000,
          limit: discoverLimit,
        });
        const seen = new Set(osmDiscovered.map((p) => p.placeId));
        for (const place of wider) {
          if (seen.has(place.placeId)) continue;
          osmDiscovered.push(place);
          seen.add(place.placeId);
        }
      }
      for (const h of discoveredToPlaceHits(osmDiscovered)) {
        if (isLowValueCandidate(h)) continue;
        if (
          !withinCityRadiusKm(h.lat, h.lng, { lat: centerLat, lng: centerLng }, 55)
        ) {
          continue;
        }
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
        if (isLowValueCandidate(h)) continue;
        if (
          !withinCityRadiusKm(h.lat, h.lng, { lat: centerLat, lng: centerLng }, 55)
        ) {
          continue;
        }
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

    // Always seed curated parks when the trip asks for them (or destination is Tokyo).
    for (const stop of [...(prefs.mustSee ?? []), ...(prefs.preferred ?? []), prefs.idealTrip]) {
      const park = matchKnownPark(String(stop), city);
      if (!park) continue;
      const hit = knownParkAsHit(park, city);
      byId.set(hit.placeId, { ...hit, city });
    }

    // Seed curated famous landmarks for sights trips (non-hidden-gems).
    // These provide stable, recognizable POIs that travelers expect in Tokyo, etc.
    if (!prefs.prefersHiddenGems) {
      const landmarks = getLandmarksForDestination(city);
      for (const lm of landmarks) {
        const hit = landmarkAsHit(lm, city);
        if (!byId.has(hit.placeId)) {
          byId.set(hit.placeId, { ...hit, city });
        }
      }
      // Also resolve must-see / preferred that match curated landmarks
      for (const stop of [...(prefs.mustSee ?? []), ...(prefs.preferred ?? [])]) {
        const lm = matchLandmarkByName(stop, landmarks);
        if (lm) {
          const hit = landmarkAsHit(lm, city);
          if (!byId.has(hit.placeId)) {
            byId.set(hit.placeId, { ...hit, city });
          }
        }
      }
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
      if (
        d &&
        withinCityRadiusKm(d.lat, d.lng, { lat: geo.lat, lng: geo.lng }, 55) &&
        !isLowValueCandidate(d)
      ) {
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
  }

  // Hard geo gate — never keep candidates outside the metro area.
  // Curated placeIds (park:, catalog:) always pass — they have vetted coords.
  for (const [pid, hit] of [...byId.entries()]) {
    if (isCuratedPlaceId(pid)) continue;
    if (!withinCityRadiusKm(hit.lat, hit.lng, { lat: geo.lat, lng: geo.lng }, 55)) {
      byId.delete(pid);
    } else if (isLowValueCandidate(hit)) {
      byId.delete(pid);
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
    const hotelPinned = Boolean(leg.hotel?.trim());
    // ~0.08° ≈ 9 km; hotel days tighten further so transit stays short.
    const geoScale = hotelPinned
      ? prefs.prefersHiddenGems
        ? 0.07
        : 0.055
      : prefs.prefersHiddenGems
        ? 0.2
        : 0.12;
    const geoFit =
      1 -
      Math.min(
        1,
        Math.hypot(c.lat - anchorLat, c.lng - anchorLng) / geoScale,
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
    // Prefer recognizable tourist attractions when the traveler asked for sights.
    if (!prefs.prefersHiddenGems) {
      const blob = c.types.join(" ").toLowerCase();
      const landmark =
        /attraction|museum|historic|monument|viewpoint|castle|temple|shrine|gallery|landmark|tourism/.test(
          blob,
        );
      const thin = /bench|toilets|parking|atm|vending|yes\b/.test(blob);
      if (landmark) discoveryRank += 0.22;
      if (thin) discoveryRank *= 0.45;
      if (wiki) discoveryRank += 0.12;
      // Curated catalog landmarks get a strong boost for sights trips
      if (c.placeId.startsWith("catalog:")) discoveryRank += 0.35;
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

  // Blend legacy popularity with discovery — sights lean harder into popularity.
  const legacyRanked = rankCandidatesWithPopularity({
    candidates: candidatesRaw,
    popularityByPlaceId: popularityMap,
    prefersHiddenGems: Boolean(prefs.prefersHiddenGems),
  });
  const discoveryWeight = prefs.prefersHiddenGems ? 0.75 : 0.45;
  const popularityWeight = 1 - discoveryWeight;

  const ranked: RankedCandidate[] = legacyRanked
    .map((c) => {
      const raw = candidatesRaw.find((r) => r.placeId === c.placeId);
      const discovery = raw?.discoveryRank ?? c.combinedRank;
      return {
        ...c,
        city: raw?.city ?? c.city,
        openingHours: raw?.openingHours,
        combinedRank:
          discoveryWeight * discovery + popularityWeight * c.combinedRank,
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
      perDay: sightseeingStopsTarget(prefs),
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
  const parkDays = parkDayAssignmentsFromText(
    prefs.idealTrip ?? "",
    prefs.mustSee ?? [],
    dayPlan.length,
  );
  for (const park of parkDays.values()) {
    const hit = knownParkAsHit(park, prefs.destination);
    if (!byId.has(hit.placeId)) {
      byId.set(hit.placeId, {
        ...hit,
        city: prefs.destination.split(/→|,/)[0]?.trim() || prefs.destination,
      });
    }
  }
  const dayRadiusKm = sameDayRadiusKm(prefs.transport, prefs.maxWalkMinutes);
  const hotelByCity = new Map<string, { lat: number; lng: number }>();
  for (const assignment of dayPlan) {
    if (hotelByCity.has(assignment.city)) continue;
    const leg = legs[assignment.legIndex] ?? legs[0];
    hotelByCity.set(assignment.city, {
      lat: leg.hotelLat ?? leg.lat ?? geo.lat,
      lng: leg.hotelLng ?? leg.lng ?? geo.lng,
    });
  }
  let neighborhoodSeeds = assignDayNeighborhoodSeeds(
    dayPlan,
    filtered.map((c) => ({
      placeId: c.placeId,
      lat: c.lat,
      lng: c.lng,
      rank: c.combinedRank,
      city: c.city,
    })),
    hotelByCity,
  );

  // Override with curated cluster centroids for destinations like Tokyo.
  // This ensures non-park days get assigned to distinct neighborhoods (west/east/central).
  const parkDayIndices = new Set(parkDays.keys());
  const dayClusters = assignDayClusters(
    dayPlan.length,
    parkDayIndices,
    prefs.destination,
  );
  for (const [dayIndex, cluster] of dayClusters) {
    neighborhoodSeeds.set(dayIndex, { lat: cluster.lat, lng: cluster.lng });
  }

  for (const assignment of dayPlan) {
    const day =
      aiByIndex.get(assignment.dayIndex) ??
      ({ dayIndex: assignment.dayIndex, activities: [] } as (typeof ai.days)[0]);

    const leg = legs[assignment.legIndex] ?? legs[0];
    const startPt = {
      lat: leg.hotelLat ?? leg.lat ?? geo.lat,
      lng: leg.hotelLng ?? leg.lng ?? geo.lng,
    };
    const dayAnchor =
      neighborhoodSeeds.get(assignment.dayIndex) ?? startPt;

    const parkForDay = parkDays.get(assignment.dayIndex) ?? null;
    // Parks reserved for other days must not leak into this day's fills.
    for (const [dayIdx, park] of parkDays) {
      if (dayIdx === assignment.dayIndex) continue;
      usedAcross.add(knownParkPlaceId(park));
    }
    const dayActsRaw = day.activities.filter((a) => {
      if (!byId.has(a.placeId)) return false;
      const hit = byId.get(a.placeId)!;
      // Keep activities in the day's city when tagged
      if (hit.city && hit.city !== assignment.city) return false;
      return true;
    });
    // Park days are exclusive — don't let the model sprinkle random city stops.
    const dayActsFiltered = parkForDay
      ? dayActsRaw.filter(
          (a) =>
            a.placeId === knownParkPlaceId(parkForDay) ||
            nameMatchesStop(
              byId.get(a.placeId)?.displayName ?? "",
              parkForDay.displayName,
            ),
        )
      : dayActsRaw;
    const dayActsNear = filterActsToNeighborhood(
      dayActsFiltered,
      byId,
      dayAnchor,
      dayRadiusKm,
    );
    const dayActs =
      parkForDay
        ? dayActsFiltered
        : dayActsNear.length >= Math.min(2, dayActsFiltered.length)
          ? dayActsNear
          : dayActsFiltered;

    const orderedIds = await orderByRoutedNeighbor(
      dayActs.map((a) => {
        const b = byId.get(a.placeId)!;
        return { ...a, lat: b.lat, lng: b.lng, placeId: a.placeId };
      }),
      dayAnchor,
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

    // Full park day from must-see / idealTrip (Disneyland, DisneySea, …).
    if (parkForDay) {
      const parkHit = byId.get(knownParkPlaceId(parkForDay))!;
      const parkNote = enrichedParkNote(parkForDay.id, parkForDay.displayName);
      activities.push({
        placeId: knownParkPlaceId(parkForDay),
        name: parkForDay.displayName,
        address: parkHit?.formattedAddress || assignment.city,
        lat: parkForDay.lat,
        lng: parkForDay.lng,
        startTime: parkForDay.openTime,
        durationMinutes: parkForDay.durationMinutes,
        priority: "must_see",
        planningNote: `${parkNote}\n\nHours ${parkForDay.openTime}–${parkForDay.closeTime} are typical — confirm the published calendar before you go.`,
        hoursVerified: false,
        openingHours: `${parkForDay.openTime}-${parkForDay.closeTime}`,
        scheduleWarnings: [
          "Park hours vary by date — confirm the official calendar.",
        ],
        travelMinutesFromPrev: 0,
      });
      cursorTime = parkForDay.closeTime;
    }

    // Booked hotel from a pasted confirmation — pin check-in on the calendar.
    if (
      assignment.dayIndex === 0 &&
      leg.hotelBooked &&
      leg.hotel?.trim()
    ) {
      const hotelSlug = leg.hotel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      activities.push({
        placeId: `hotel:checkin:${hotelSlug}`,
        name: `Check-in · ${leg.hotel}`,
        address: leg.hotelAddress || assignment.city,
        lat: leg.hotelLat ?? startPt.lat,
        lng: leg.hotelLng ?? startPt.lng,
        startTime: "15:00",
        durationMinutes: 45,
        priority: "must_see",
        planningNote:
          "From your hotel confirmation. Sightseeing is planned around this stay to cut transit.",
        hoursVerified: false,
        scheduleWarnings: [],
        travelMinutesFromPrev: 0,
      });
    }

    // Restaurant reservations from pasted confirmations for this day.
    const dayDateObj = localTripDate(prefs.startDate, assignment.dayIndex);
    const dayDateIso = `${dayDateObj.getFullYear()}-${String(dayDateObj.getMonth() + 1).padStart(2, "0")}-${String(dayDateObj.getDate()).padStart(2, "0")}`;
    for (const meal of prefs.bookedRestaurants ?? []) {
      if (!meal.name?.trim()) continue;
      if (meal.date && meal.date !== dayDateIso) continue;
      if (
        meal.city &&
        meal.city.toLowerCase() !== assignment.city.toLowerCase()
      ) {
        continue;
      }
      if (!meal.date && assignment.dayIndex !== 0) continue;
      const mealSlug = meal.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      const mealTime = (meal.time || "19:00").slice(0, 5);
      activities.push({
        placeId: `restaurant:booked:${mealSlug}`,
        name: meal.name.trim(),
        address: meal.city || assignment.city,
        lat: startPt.lat,
        lng: startPt.lng,
        startTime: mealTime,
        durationMinutes: 90,
        priority: "must_see",
        planningNote: "From your restaurant reservation confirmation.",
        hoursVerified: false,
        scheduleWarnings: [],
        travelMinutesFromPrev: 0,
      });
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
    if (parkForDay) usedPlaces.add(knownParkPlaceId(parkForDay));

    const placeOne = async (
      placeId: string,
      durationMinutes: number,
      priority: GeneratedActivity["priority"],
      planningNote: string | undefined,
      requireKnownHours: boolean,
    ) => {
      if (usedAcross.has(placeId) || usedPlaces.has(placeId) || !byId.has(placeId)) return false;
      const candidate = byId.get(placeId)!;
      if (isGenericName(candidate.displayName)) {
        usedPlaces.add(placeId);
        return false;
      }
      if (
        dayWet &&
        priority !== "must_see" &&
        isOutdoorPlace(candidate.types, candidate.displayName)
      ) {
        return false;
      }
      if (!isCuratedPlaceId(placeId) && !detailsCache.has(placeId)) {
        detailsCache.set(placeId, await getPlaceDetails(placeId));
      }
      const details = isCuratedPlaceId(placeId)
        ? null
        : detailsCache.get(placeId);
      const base = byId.get(placeId)!;
      // Details lookup can remap Nominatim ids to wrong countries — keep city-local coords.
      const safeDetails =
        details &&
        withinCityRadiusKm(details.lat, details.lng, {
          lat: startPt.lat,
          lng: startPt.lng,
        }, 55)
          ? details
          : null;
      if (details && !safeDetails) {
        detailsCache.delete(placeId);
      }
      const published =
        (safeDetails?.regularOpeningHours as { osmOpeningHours?: string } | undefined)
          ?.osmOpeningHours ??
        base.openingHours ??
        safeDetails?.regularOpeningHours;
      const fit = fitVisit({
        openingHours: published,
        cursor: cursorTime,
        durationMinutes,
        dayDate,
        dayEnd,
      });
      if (fit.status === "closed") {
        warnings.push(`${safeDetails?.displayName ?? base.displayName}: ${fit.reason}`);
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
            ? "public map data"
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
        name: safeDetails?.displayName ?? base.displayName,
        address: safeDetails?.formattedAddress ?? base.formattedAddress,
        lat: safeDetails?.lat ?? base.lat,
        lng: safeDetails?.lng ?? base.lng,
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

    // Helper to count non-anchor sightseeing activities
    const sightseeing = () =>
      activities.filter(
        (item) =>
          !item.placeId.startsWith("flight:") &&
          !item.placeId.startsWith("transit:") &&
          !item.placeId.startsWith("hotel:") &&
          !item.placeId.startsWith("restaurant:booked:"),
      ).length;

    // PRIORITY: For curated destinations (Tokyo), fill from cluster landmarks FIRST.
    // This ensures day themes match quality itineraries (east/traditional → west/modern → central).
    const dayCluster = dayClusters.get(assignment.dayIndex);
    const target = parkForDay ? 1 : sightseeingStopsTarget(prefs);
    if (dayCluster && !parkForDay) {
      const clusterLandmarks = getLandmarksForCluster(dayCluster, assignment.city);
      for (const lm of clusterLandmarks) {
        if (sightseeing() >= target) break;
        const pid = catalogPlaceId(lm);
        if (usedAcross.has(pid) || usedPlaces.has(pid)) continue;
        // West modern day: keep Shinjuku nightlife for evening after Harajuku/Shibuya.
        if (
          lm.types.includes("nightlife") ||
          lm.types.includes("evening")
        ) {
          const [h, m] = cursorTime.slice(0, 5).split(":").map(Number);
          if ((h || 0) * 60 + (m || 0) < 17 * 60 + 30) {
            cursorTime = "17:30";
          }
        }
        await placeOne(
          pid,
          lm.durationMinutes,
          "preferred",
          `${lm.note} Part of ${dayCluster.dayTheme}.`,
          false,
        );
      }
    }

    // Then process AI/fallback activities (only if cluster fill didn't reach target)
    for (const act of orderedIds) {
      if (sightseeing() >= target) break;
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

    // Park days are one exclusive must-see — don't pad with city fillers.
    const cityWidePool = filtered.filter(
      (candidate) =>
        (candidate.city ?? assignment.city) === assignment.city &&
        !usedAcross.has(candidate.placeId) &&
        !candidate.placeId.startsWith("park:"),
    );
    // Keep this day's fills in one neighborhood (widen only if the pool is thin).
    const liveAnchor =
      centroidOf(
        activities
          .filter(
            (a) =>
              !a.placeId.startsWith("transit:") &&
              !a.placeId.startsWith("flight:"),
          )
          .map((a) => ({ lat: a.lat, lng: a.lng })),
      ) ?? dayAnchor;
    const cityPool = neighborhoodPool(
      cityWidePool,
      liveAnchor,
      dayRadiusKm,
      Math.max(target, 4),
    );
    // Lock major stops into the day when they match this day's cluster/neighborhood.
    // Only claim a must-see when it sits in today's neighborhood so day 1
    // does not vacuum every landmark across the city.
    for (const stop of prefs.mustSee ?? []) {
      if (sightseeing() >= target) break;
      const reservedPark = matchKnownPark(stop, assignment.city);
      if (reservedPark) {
        const reservedDay = [...parkDays.entries()].find(
          ([, park]) => park.id === reservedPark.id,
        )?.[0];
        if (reservedDay != null && reservedDay !== assignment.dayIndex) {
          continue;
        }
        if (parkForDay?.id === reservedPark.id) continue;
      }
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
          : "Same-area stop to keep transit short.",
        false,
      );
    }
    // If wet-weather filtering left the day empty, allow outdoor fills with a warning.
    if (dayWet && sightseeing() === 0) {
      warnings.push(
        `Day ${assignment.dayIndex + 1} is wet, but few indoor options were available — outdoor stops were kept as a fallback.`,
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
        `We couldn't schedule listed places in ${assignment.city} on day ${assignment.dayIndex + 1}.`,
      );
    }

    // Re-order sightseeing geographically after fills (keeps transit/flight anchors first).
    const anchoredActs = activities.filter((a) =>
      isBookingAnchorPlaceId(a.placeId),
    );
    const sightActs = activities.filter(
      (a) => !isBookingAnchorPlaceId(a.placeId),
    );
    if (sightActs.length > 1) {
      const routeStart =
        centroidOf(sightActs.map((a) => ({ lat: a.lat, lng: a.lng }))) ??
        dayAnchor;
      const reordered = await orderByRoutedNeighbor(
        sightActs,
        routeStart,
        routeMode,
      );
      // Prefer variety, but never yank the path across town for a bucket swap.
      const variedOrder: typeof reordered = [];
      const leftover = [...reordered];
      let prevBucket = "";
      while (leftover.length) {
        const prev = variedOrder[variedOrder.length - 1] ?? null;
        const pick = varietyPickIndex(
          leftover,
          prev,
          prevBucket,
          (item) =>
            experienceBucket(
              byId.get(item.placeId)?.types ?? [],
              item.name,
            ),
          dayRadiusKm * 1.15,
        );
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
    let route = await computeDayRoute({
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
        const rawTravel = routeLeg?.durationMinutes ?? 0;
        const travelCap = routeMode === "WALK" ? 75 : routeMode === "TRANSIT" ? 90 : 120;
        const travel = Math.min(rawTravel, travelCap);
        activities[i].travelMinutesFromPrev = travel;
        activities[i].travelRouted =
          travel === rawTravel &&
          (route.source === "osrm" || route.source === "google");
        if (rawTravel > 45) {
          warnings.push(
            `Long transfer (${rawTravel} min) before ${activities[i].name} — likely a real-path detour (bridge, one-way, or sparse paths), not crow-flies distance.`,
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
          !item.placeId.startsWith("flight:") &&
          !item.placeId.startsWith("hotel:") &&
          !item.placeId.startsWith("restaurant:booked:"),
      ).length;
    // Refill → re-route/clock/constrain, then refill again if still thin (up to 2 passes).
    for (let refillPass = 0; refillPass < 2; refillPass++) {
      if (parkForDay) break;
      if (finishedSightseeing() >= target) break;
      const already = new Set(finished.map((item) => item.placeId));
      let cursor =
        finished.length > 0
          ? addMinutes(
              finished[finished.length - 1].startTime,
              finished[finished.length - 1].durationMinutes + 15,
            )
          : defaultStart.slice(0, 5);
      const refillAnchor =
        centroidOf(
          finished
            .filter(
              (a) =>
                !a.placeId.startsWith("transit:") &&
                !a.placeId.startsWith("flight:"),
            )
            .map((a) => ({ lat: a.lat, lng: a.lng })),
        ) ?? dayAnchor;
      const nearCity = neighborhoodPool(
        cityWidePool.filter((c) => !already.has(c.placeId)),
        refillAnchor,
        dayRadiusKm,
        Math.max(target, 4),
      );
      const refillPool = [
        ...nearCity.filter((c) => !usedAcross.has(c.placeId)),
        ...nearCity,
        ...cityPool.filter((c) => !already.has(c.placeId) && !usedAcross.has(c.placeId)),
        // Last resort: citywide (still same city) if the neighborhood is thin
        ...filtered.filter(
          (c) =>
            !already.has(c.placeId) &&
            !usedAcross.has(c.placeId) &&
            !c.placeId.startsWith("park:") &&
            (!c.city || c.city === assignment.city),
        ),
      ];
      const seenRefill = new Set<string>();
      let added = 0;
      for (const candidate of refillPool) {
        if (finishedSightseeing() >= target) break;
        if (seenRefill.has(candidate.placeId)) continue;
        seenRefill.add(candidate.placeId);
        const hit = byId.get(candidate.placeId);
        if (!hit) continue;
        added += 1;
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
      if (!added) break;

      const refillRouteStartIdx = finished.findIndex(
        (a) => !a.placeId.startsWith("transit:") && !a.placeId.startsWith("flight:"),
      );
      const refillRoutePoints = finished
        .slice(Math.max(0, refillRouteStartIdx))
        .map((a) => ({ lat: a.lat, lng: a.lng }));
      const refillRoute = await computeDayRoute({
        mode: routeMode,
        points:
          refillRoutePoints.length >= 2
            ? refillRoutePoints
            : finished.map((a) => ({ lat: a.lat, lng: a.lng })),
      });
      if (refillRoute && refillRouteStartIdx >= 0) {
        route = refillRoute;
        const travelCap = routeMode === "WALK" ? 75 : routeMode === "TRANSIT" ? 90 : 120;
        for (let i = refillRouteStartIdx + 1; i < finished.length; i++) {
          const routeLeg = refillRoute.legs[i - refillRouteStartIdx - 1];
          const rawTravel = routeLeg?.durationMinutes ?? 0;
          const travel = Math.min(rawTravel, travelCap);
          finished[i].travelMinutesFromPrev = travel;
          finished[i].travelRouted =
            travel === rawTravel &&
            (refillRoute.source === "osrm" || refillRoute.source === "google");
        }
      }
      const relaxHours = refillPass > 0;
      const refillClocked = fitDayClock(
        finished.map((activity) => {
          const details = detailsCache.get(activity.placeId);
          const rawHours =
            details && "regularOpeningHours" in (details as object)
              ? (details as { regularOpeningHours?: unknown }).regularOpeningHours
              : activity.openingHours;
          return {
            ...activity,
            hoursWindow:
              typeof activity.openingHours === "string" ? activity.openingHours : null,
            openingHours: relaxHours
              ? undefined
              : (rawHours ?? activity.openingHours),
            dayDate,
            types: activity.types ?? byId.get(activity.placeId)?.types ?? [],
          };
        }),
        {
          dayEnd,
          mealGapMinutes: 60,
          isMeal: (item) => isSitDown(item.types ?? []),
          anchored: (item) =>
            item.placeId.startsWith("flight:") || item.placeId.startsWith("transit:"),
        },
      );
      for (const drop of refillClocked.dropped) warnings.push(drop.reason);
      const refillConstrained = applyDayConstraints(
        refillClocked.kept.map((activity) => ({
          ...activity,
          types: activity.types ?? byId.get(activity.placeId)?.types ?? [],
          wheelchair: byId.get(activity.placeId)?.wheelchair,
          fee: byId.get(activity.placeId)?.fee,
          cuisine: byId.get(activity.placeId)?.cuisine,
        })),
        {
          maxWalkMinutes:
            refillPass > 0
              ? Math.max(prefs.maxWalkMinutes ?? 25, 45)
              : prefs.maxWalkMinutes,
          walking: prefs.transport !== "driving" && prefs.transport !== "transit",
          stepFree: wantsStepFree(prefs.accessibility),
          dietary: prefs.dietary,
          wetWeather: refillPass > 0 ? false : dayWet,
          isOutdoor: (stop) => isOutdoorPlace(stop.types, stop.name),
          isMustSee: (stop) => stop.priority === "must_see",
          transit: finished
            .filter((activity) => activity.placeId.startsWith("transit:"))
            .map((activity) => ({
              start: activity.startTime,
              durationMinutes: activity.durationMinutes,
            })),
        },
      );
      for (const drop of refillConstrained.dropped) warnings.push(drop.reason);
      finished = refillConstrained.kept.map((activity) => {
        const note = refillConstrained.notes[activity.placeId];
        const extra = [note?.fee, note?.access, note?.cuisine].filter(Boolean).join(" ");
        return {
          ...activity,
          planningNote: extra
            ? `${activity.planningNote ?? ""} ${extra}`.trim()
            : activity.planningNote,
        };
      });
    }

    // Last-resort pack: rebuild a full daytime slate when clock/routing gutted the day.
    const thinBeforePack = finishedSightseeing();
    if (!parkForDay && thinBeforePack < target) {
      warnings.push(
        `Day ${assignment.dayIndex + 1}: packing toward ${target} stops (had ${thinBeforePack}).`,
      );
      const anchors = finished.filter(
        (item) =>
          item.placeId.startsWith("flight:") ||
          item.placeId.startsWith("transit:"),
      );
      const keptSight = finished.filter(
        (item) =>
          !item.placeId.startsWith("flight:") &&
          !item.placeId.startsWith("transit:"),
      );
      const already = new Set(finished.map((item) => item.placeId));
      const packAnchor =
        centroidOf(keptSight.map((a) => ({ lat: a.lat, lng: a.lng }))) ??
        dayAnchor;
      const extras = neighborhoodPool(
        [...byId.values()].filter(
          (hit) =>
            (!hit.city || hit.city === assignment.city) &&
            !already.has(hit.placeId) &&
            !hit.placeId.startsWith("park:") &&
            !isGenericName(hit.displayName) &&
            !isLowValueCandidate(hit),
        ),
        packAnchor,
        dayRadiusKm,
        Math.max(target, 4),
      );
      // Prefer unused-across-days; reuse ordinary city stops only if the pool is thin.
      // Never reuse reserved park: ids (filtered out above).
      extras.sort(
        (a, b) =>
          Number(usedAcross.has(a.placeId)) - Number(usedAcross.has(b.placeId)),
      );
      warnings.push(
        `Day ${assignment.dayIndex + 1}: emergency pool ${keptSight.length} kept + ${extras.length} extras.`,
      );
      let cursor = defaultStart.slice(0, 5);
      if (anchors.length) {
        const lastAnchor = anchors[anchors.length - 1];
        cursor = addMinutes(
          lastAnchor.startTime,
          lastAnchor.durationMinutes + 30,
        );
      }
      const packed: typeof finished = [...anchors];
      const seenEmergency = new Set<string>(anchors.map((a) => a.placeId));
      const endMin =
        Number(dayEnd.slice(0, 2)) * 60 + Number(dayEnd.slice(3, 5));

      const pushStop = (
        hit: {
          placeId: string;
          displayName: string;
          formattedAddress?: string;
          lat: number;
          lng: number;
          types?: string[];
          wheelchair?: string | null;
          fee?: string | null;
          cuisine?: string | null;
        },
        base?: (typeof finished)[number],
      ) => {
        if (seenEmergency.has(hit.placeId)) return false;
        const duration = isSitDown(hit.types ?? base?.types ?? []) ? 70 : 80;
        const startMin =
          Number(cursor.slice(0, 2)) * 60 + Number(cursor.slice(3, 5));
        if (!Number.isFinite(startMin) || startMin + duration > endMin) {
          return false;
        }
        seenEmergency.add(hit.placeId);
        if (base) {
          packed.push({
            ...base,
            startTime: cursor,
            durationMinutes: duration,
            travelMinutesFromPrev: packed.length > anchors.length ? 15 : 0,
          });
        } else {
          packed.push({
            placeId: hit.placeId,
            name: hit.displayName,
            address: hit.formattedAddress,
            lat: hit.lat,
            lng: hit.lng,
            startTime: cursor,
            durationMinutes: duration,
            priority: "preferred",
            planningNote: `Packed so day ${assignment.dayIndex + 1} in ${assignment.city} stays complete.`,
            hoursVerified: false,
            scheduleWarnings: [
              "Added to keep a full day plan — confirm hours and travel before you go.",
            ],
            travelMinutesFromPrev: packed.length > anchors.length ? 15 : 0,
            types: hit.types ?? [],
            wheelchair: hit.wheelchair,
            fee: hit.fee,
            cuisine: hit.cuisine,
            hoursWindow: null,
            openingHours: undefined,
            dayDate,
          } as (typeof finished)[number]);
        }
        cursor = addMinutes(cursor, duration + 15);
        return true;
      };

      for (const item of keptSight) {
        if (
          packed.filter(
            (row) =>
              !row.placeId.startsWith("flight:") &&
              !row.placeId.startsWith("transit:"),
          ).length >= target
        ) {
          break;
        }
        pushStop(
          {
            placeId: item.placeId,
            displayName: item.name,
            formattedAddress: item.address,
            lat: item.lat,
            lng: item.lng,
            types: item.types,
          },
          item,
        );
      }
      for (const hit of extras) {
        if (
          packed.filter(
            (row) =>
              !row.placeId.startsWith("flight:") &&
              !row.placeId.startsWith("transit:"),
          ).length >= target
        ) {
          break;
        }
        pushStop(hit);
      }
      const packedAnchors = packed.filter(
        (row) =>
          row.placeId.startsWith("flight:") ||
          row.placeId.startsWith("transit:"),
      );
      const packedSight = packed.filter(
        (row) =>
          !row.placeId.startsWith("flight:") &&
          !row.placeId.startsWith("transit:"),
      );
      if (packedSight.length > 1) {
        const reorderedPack = await orderByRoutedNeighbor(
          packedSight,
          packAnchor,
          routeMode,
        );
        let packCursor = defaultStart.slice(0, 5);
        if (packedAnchors.length) {
          const last = packedAnchors[packedAnchors.length - 1];
          packCursor = addMinutes(last.startTime, last.durationMinutes + 30);
        }
        for (const stop of reorderedPack) {
          stop.startTime = packCursor;
          packCursor = addMinutes(packCursor, stop.durationMinutes + 15);
        }
        finished = [...packedAnchors, ...reorderedPack];
      } else {
        finished = packed;
      }
    }

    if (finishedSightseeing() < target) {
      warnings.push(
        `Day ${assignment.dayIndex + 1} in ${assignment.city} still has only ${finishedSightseeing()} stops — the place list for this city was thin.`,
      );
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
