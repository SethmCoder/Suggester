import type { ActivityRow } from "@/lib/types/trip";
import {
  combineDiscoveryRank,
  placeQualityScore,
} from "@/lib/places/rank";
import { discoverPlacesFromOsm } from "@/lib/places/osm-discover";
import type { DiscoveredPlace, PlaceCategory } from "@/lib/places/types";
import { haversineKm } from "./scheduler";
import type { AssistantPatch } from "./patch";

type DayInfo = { id: string; day_index: number };

export type MealKind = "lunch" | "dinner" | "cafe" | "any";

const FOOD_RE =
  /(?:best|top|good|great|recommend(?:ed)?|where(?:\s+to)?|suggest(?:ed)?).{0,40}(?:eat|food|restaurant|dining|lunch|dinner|brunch|cafe|café)|places?\s+to\s+eat|restaurants?\s+(?:near|in|around|by)|(?:lunch|dinner|brunch|cafe|café)\s+(?:near|in|around|spots?|places?|recommendations?)/i;

export function isFoodRecommendQuery(message: string): boolean {
  return FOOD_RE.test(message);
}

export function detectMealKind(message: string): MealKind {
  const m = message.toLowerCase();
  if (/dinner|supper|evening\s+meal/i.test(m)) return "dinner";
  if (/brunch|breakfast/i.test(m)) return "cafe";
  if (/café|cafe|coffee/i.test(m) && !/restaurant/i.test(m)) return "cafe";
  if (/lunch|midday|mid-day/i.test(m)) return "lunch";
  return "any";
}

function mealStartTime(kind: MealKind): string {
  if (kind === "dinner") return "19:00";
  if (kind === "cafe") return "10:30";
  if (kind === "lunch") return "12:30";
  return "12:45";
}

function categoriesForMeal(kind: MealKind): PlaceCategory[] {
  if (kind === "cafe") return ["cafe"];
  if (kind === "any") return ["restaurant", "cafe"];
  return ["restaurant"];
}

export function dayCentroid(
  activities: ActivityRow[],
): { lat: number; lng: number } | null {
  const pts = activities.filter(
    (a) => a.lat != null && a.lng != null,
  ) as { lat: number; lng: number }[];
  if (!pts.length) return null;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
}

/** Score restaurant near a day's activity cluster — proximity outweighs distant "famous" spots. */
export function scoreRestaurantNearDay(input: {
  place: DiscoveredPlace;
  centerLat: number;
  centerLng: number;
  maxKm?: number;
}): { score: number; distKm: number; quality: number; geography: number } {
  const maxKm = input.maxKm ?? 2.5;
  const distKm = haversineKm(
    input.centerLat,
    input.centerLng,
    input.place.lat,
    input.place.lng,
  );
  const geography = Math.max(0, 1 - distKm / maxKm);
  const tags = input.place.tags;
  const starsRaw = tags.stars ?? tags.rating;
  const stars = starsRaw ? Number.parseFloat(starsRaw) : NaN;
  let quality = placeQualityScore({
    hasAddress: Boolean(input.place.address),
    hasWikipedia: Boolean(input.place.wikipediaTitle || input.place.wikidataId),
    tagCount: Object.keys(tags).length,
  });
  if (Number.isFinite(stars) && stars > 0) {
    // OSM stars (1–5) — rare but useful when present
    quality = Math.min(1, quality * 0.55 + Math.min(1, stars / 5) * 0.45);
  }
  if (tags.cuisine) quality = Math.min(1, quality + 0.08);
  if (tags.outdoor_seating === "yes") quality = Math.min(1, quality + 0.03);

  // Geography is the dominant signal so far-side-of-town spots lose
  const score = combineDiscoveryRank({
    relevance: 0.75 + (tags.cuisine ? 0.15 : 0),
    geography,
    quality,
    interest: null,
    weights: {
      relevance: 0.2,
      geography: 0.5,
      quality: 0.3,
      onlineInterest: 0,
    },
  });

  return { score, distKm, quality, geography };
}

function findLandmarkCenter(
  message: string,
  activities: ActivityRow[],
): { lat: number; lng: number; label: string } | null {
  const near = message.match(
    /(?:near|around|by|at|in)\s+(?:the\s+)?([a-z0-9àâäéèêëïîôùûüç'’.\-\s]{3,40})/i,
  );
  const hint = (near?.[1] ?? "").toLowerCase().replace(/[.?!,]+$/, "").trim();
  if (hint.length < 3) return null;
  // Drop trailing "paris" / "dubai" etc. city noise for matching
  const cleaned = hint
    .replace(/\b(paris|france|dubai|uae|united arab emirates)\b/gi, "")
    .trim();
  const needle = cleaned.length >= 3 ? cleaned : hint;
  const act =
    activities.find(
      (a) =>
        a.lat != null &&
        a.lng != null &&
        a.name.toLowerCase().includes(needle.slice(0, 18)),
    ) ??
    activities.find(
      (a) =>
        a.lat != null &&
        a.lng != null &&
        needle.includes(a.name.toLowerCase().slice(0, 10)),
    );
  if (!act || act.lat == null || act.lng == null) return null;
  return { lat: act.lat, lng: act.lng, label: act.name };
}

function detectDayIndex(msg: string, days: DayInfo[]): number | null {
  const m = msg.match(/day\s*(\d+)/i);
  if (m) {
    const n = Number(m[1]) - 1;
    if (days.some((d) => d.day_index === n)) return n;
  }
  return null;
}

function activitiesForDay(
  activities: ActivityRow[],
  days: DayInfo[],
  dayIndex: number,
) {
  const day = days.find((d) => d.day_index === dayIndex);
  if (!day) return [];
  return activities
    .filter((a) => a.day_id === day.id)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Discover restaurants near each day's stops and emit insert ops.
 * The top pick per day is marked recommended (starred on the map).
 */
export async function buildFoodRecommendPatch(input: {
  message: string;
  days: DayInfo[];
  activities: ActivityRow[];
  destination?: string;
}): Promise<AssistantPatch> {
  const meal = detectMealKind(input.message);
  const startTime = mealStartTime(meal);
  const cats = categoriesForMeal(meal);
  const singleDay = detectDayIndex(input.message, input.days);
  const landmark = findLandmarkCenter(input.message, input.activities);
  const dest =
    input.destination?.replace(/\s*\(Demo\)\s*/i, "").trim() || "trip";

  const dayIndexes =
    singleDay != null
      ? [singleDay]
      : input.days.map((d) => d.day_index).sort((a, b) => a - b);

  const operations: AssistantPatch["operations"] = [];
  const daySummaries: string[] = [];
  let usedOsm = false;

  for (const dayIndex of dayIndexes) {
    const dayActs = activitiesForDay(
      input.activities,
      input.days,
      dayIndex,
    );
    const cluster =
      dayCentroid(dayActs) ?? dayCentroid(input.activities);
    const center = landmark
      ? { lat: landmark.lat, lng: landmark.lng, label: landmark.label }
      : cluster
        ? {
            lat: cluster.lat,
            lng: cluster.lng,
            label: `day ${dayIndex + 1} stops`,
          }
        : null;
    if (!center) {
      daySummaries.push(
        `Day ${dayIndex + 1}: no mapped stops yet — open the map once places have coordinates.`,
      );
      continue;
    }

    let places = await discoverPlacesFromOsm({
      destination: `${dest}|day${dayIndex}`,
      lat: center.lat,
      lng: center.lng,
      radiusMeters: 1600,
      categories: cats,
      limit: 36,
    });
    if (places.length < 4) {
      const wider = await discoverPlacesFromOsm({
        destination: `${dest}|day${dayIndex}|wide`,
        lat: center.lat,
        lng: center.lng,
        radiusMeters: 2800,
        categories: cats,
        limit: 48,
      });
      places = wider.length ? wider : places;
    }
    if (places.length) usedOsm = true;

    const ranked = places
      .map((place) => ({
        place,
        ...scoreRestaurantNearDay({
          place,
          centerLat: center.lat,
          centerLng: center.lng,
          maxKm: 2.8,
        }),
      }))
      .filter((r) => r.distKm <= 3.2)
      .sort((a, b) => b.score - a.score);

    let picks = ranked.slice(0, 3);
    // Soft offline / Overpass-down fallback — still pins near the day's cluster
    if (!picks.length) {
      const offset = 0.0018 * (dayIndex + 1);
      const fake: DiscoveredPlace = {
        placeId: `local:food:${dayIndex}`,
        name: `${meal === "cafe" ? "Café" : "Restaurant"} near ${center.label}`,
        category: meal === "cafe" ? "cafe" : "restaurant",
        address: null,
        lat: center.lat + offset * 0.4,
        lng: center.lng + offset,
        osmId: `local/${dayIndex}`,
        tags: { amenity: meal === "cafe" ? "cafe" : "restaurant" },
        wikipediaTitle: null,
        wikidataId: null,
        source: "openstreetmap",
        retrievedAt: new Date().toISOString(),
      };
      picks = [
        {
          place: fake,
          ...scoreRestaurantNearDay({
            place: fake,
            centerLat: center.lat,
            centerLng: center.lng,
          }),
        },
      ];
    }

    const star = picks[0];
    const centerLabel = center.label;

    picks.forEach((pick, i) => {
      const recommended = i === 0;
      const distM = Math.round(pick.distKm * 1000);
      operations.push({
        op: "insert",
        toDayIndex: dayIndex,
        placeId: pick.place.placeId,
        name: pick.place.name,
        startTime,
        durationMinutes: meal === "cafe" ? 45 : 75,
        priority: recommended ? "must_see" : "optional",
        planningNote: recommended
          ? `★ Recommended for day ${dayIndex + 1} — closest strong match to ${centerLabel} (~${distM} m). OSM tags/cuisine used; verify hours before going.`
          : `Nearby ${meal === "cafe" ? "café" : "restaurant"} option (~${distM} m from ${centerLabel}).`,
        lat: pick.place.lat,
        lng: pick.place.lng,
        address: pick.place.address ?? undefined,
        recommended,
        popularityLabel: recommended
          ? "Day pick ★"
          : pick.quality >= 0.7
            ? "Well-tagged place"
            : undefined,
        popularitySources: ["openstreetmap"],
      });
    });

    daySummaries.push(
      `Day ${dayIndex + 1}: ★ ${star.place.name} (${Math.round(star.distKm * 1000)} m)` +
        (picks.length > 1
          ? ` + ${picks.length - 1} nearby option${picks.length > 2 ? "s" : ""}`
          : ""),
    );
  }

  if (!operations.length) {
    return {
      summary: usedOsm
        ? "I looked for places to eat near your stops but couldn’t rank a confident set. Try naming a landmark already on the itinerary."
        : "I couldn’t reach the map directory right now. Try again online, or ask once your day’s stops have map pins.",
      operations: [],
      suggestions: [
        "Best places to eat near the Eiffel Tower",
        "Recommend lunch for day 2",
        "Dinner restaurants around our stops",
      ],
    };
  }

  const mealLabel =
    meal === "dinner"
      ? "dinner"
      : meal === "cafe"
        ? "cafés"
        : meal === "lunch"
          ? "lunch"
          : "places to eat";

  return {
    summary: `Here are ${mealLabel} near each day’s cluster (not across town). Starred picks are the best balance of proximity and place quality for that day. Approve to drop them on the map.\n${daySummaries.join(" · ")}`,
    operations,
    suggestions: [
      "Only keep the starred restaurant on each day",
      "Swap dinner for lunch times instead",
      "Find cafés near day 1 stops",
    ],
  };
}
