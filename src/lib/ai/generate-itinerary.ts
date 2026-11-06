import Groq from "groq-sdk";
import { plannerModel } from "@/lib/billing/model";
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
  combineDiscoveryRank,
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
  haversineKm,
  orderByRoutedNeighbor,
} from "./scheduler";
import { anchorUnbookedLegs } from "../hotels/hotelrec";
import type { TripLeg } from "../types/trip";
import { expandLegsToDays, legsLabel } from "../trips/legs";
import { planIntercityTransit } from "../trips/intercity-transit";
import {
  primaryDestinationLabel,
  resolveTripLegs,
} from "../trips/resolve-legs";

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
  },
): Promise<ItineraryGeneration | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const client = new Groq({ apiKey });
  const model = await plannerModel();
  const popConfig = getPopularityConfig();

  let completion;
  try {
    completion = await client.chat.completions.create({
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
          destinationContextBlock,
          dayPlan: extra?.dayPlan,
          hotelNotes: extra?.hotelNotes,
        }),
      },
    ],
  });

    const raw = completion.choices[0]?.message?.content;
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

function fallbackScheduleMultiCity(
  prefs: TripPreferencesInput,
  candidates: RankedCandidate[],
  dayPlan: ReturnType<typeof expandLegsToDays>,
): ItineraryGeneration {
  const perDay =
    prefs.intensity === "packed" ? 4 : prefs.intensity === "relaxed" ? 2 : 3;
  const used = new Set<string>();
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
      priority: "preferred";
      planningNote: string;
    }[] = [];
    // Leave morning free on transit arrival days
    const startSlot = day.isArrivalTransitDay ? 1 : 0;
    for (let a = startSlot; a < perDay && activities.length < perDay; a++) {
      const pick = pool[activities.length];
      if (!pick) break;
      used.add(pick.placeId);
      activities.push({
        placeId: pick.placeId,
        startTime: `${String(10 + a * 2).padStart(2, "0")}:00`,
        durationMinutes: 90,
        priority: "preferred",
        planningNote: `Scheduled in ${day.city}${day.hotel ? ` near ${day.hotel}` : ""}`,
      });
    }
    result.push({ dayIndex: day.dayIndex, activities });
  }
  return { days: result };
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
  };

  const byId = new Map<string, Hit>();
  const wikiByPlace = new Map<string, string | null>();
  let onlineInterest = new Map<string, OnlineInterestSignal>();
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
        interests: prefs.interests.length
          ? prefs.interests
          : ["tourist attraction"],
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
    const rel = interestMatch(c.types, prefs.interests);
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
    const discoveryRank =
      combineDiscoveryRank({
        relevance: rel,
        geography: geoFit,
        quality,
        interest,
        prefersHiddenGems: Boolean(prefs.prefersHiddenGems),
      }) + (c.openingHours ? 0.04 : 0);
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
    .sort((a, b) => b.combinedRank - a.combinedRank);

  const avoidLower = prefs.avoid.map((a) => a.toLowerCase());
  const filtered = ranked.filter(
    (c) => !avoidLower.some((a) => c.displayName.toLowerCase().includes(a)),
  );

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

  let ai = await callGroq(
    prefs,
    filtered,
    destinationContextBlock || undefined,
    { dayPlan, hotelNotes },
  );
  if (!ai) {
    ai = fallbackScheduleMultiCity(prefs, filtered, dayPlan);
  }

  const warnings = ai.warnings ?? [];
  const detailsCache = new Map<string, Awaited<ReturnType<typeof getPlaceDetails>>>();

  const routeMode =
    prefs.transport === "driving"
      ? "DRIVE"
      : prefs.transport === "transit"
        ? "TRANSIT"
        : "WALK";

  const days: GeneratedDay[] = [];
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
    const dayEnd = (prefs.dayEnd ?? "21:00").slice(0, 5);
    const usedPlaces = new Set<string>();

    const placeOne = async (
      placeId: string,
      durationMinutes: number,
      priority: GeneratedActivity["priority"],
      planningNote: string | undefined,
      requireKnownHours: boolean,
    ) => {
      if (usedPlaces.has(placeId) || !byId.has(placeId)) return false;
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

    const target =
      prefs.intensity === "relaxed" ? 3 : prefs.intensity === "packed" ? 5 : 4;
    const sightseeing = () =>
      activities.filter(
        (item) =>
          !item.placeId.startsWith("transit:") &&
          !item.placeId.startsWith("flight:"),
      ).length;
    for (const candidate of filtered) {
      if (sightseeing() >= target) break;
      if ((candidate.city ?? assignment.city) !== assignment.city) continue;
      if (!candidate.openingHours) continue;
      await placeOne(candidate.placeId, 90, "preferred", undefined, true);
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
        activities[i].startTime = addMinutes(
          activities[i - 1].startTime,
          activities[i - 1].durationMinutes + travel,
        );
      }
    }

    days.push({
      dayIndex: assignment.dayIndex,
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
