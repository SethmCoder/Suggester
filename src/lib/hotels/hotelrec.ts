/**
 * Hotel suggestions and review quotes from a local HotelRec subset.
 * Quotes are verbatim dataset text. Nothing here is written by a model.
 *
 * Dataset: Diego Antognini and Boi Faltings, HotelRec (LREC 2020).
 * https://github.com/diegoantognini/HotelRec
 */

import fs from "fs";
import path from "path";

export type HotelPlacePreference = "any" | "center" | "beach" | "sights" | "transit";

export type HotelQuote = {
  author: string;
  date: string;
  rating: number | null;
  title: string;
  text: string;
};

export type HotelRecord = {
  id: string;
  name: string;
  location: string;
  rating: number;
  n: number;
  locationScore: number | null;
  beach: number;
  center: number;
  sights: number;
  transit: number;
  quotes: HotelQuote[];
};

export type HotelSuggestion = {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviewCount: number;
  locationScore: number | null;
  quotes: HotelQuote[];
};

type HotelRecFile = {
  citation?: string;
  hotels?: HotelRecord[];
};

const CITATION =
  "Diego Antognini and Boi Faltings. HotelRec: a Novel Very Large-Scale Hotel Recommendation Dataset. LREC 2020.";

let cached: HotelRecord[] | null = null;
let cachedCitation = CITATION;

export function loadHotelRec(): { hotels: HotelRecord[]; citation: string } {
  if (cached) return { hotels: cached, citation: cachedCitation };
  const file = path.join(process.cwd(), "data/hotelrec/subset.json");
  if (!fs.existsSync(file)) {
    cached = [];
    return { hotels: [], citation: cachedCitation };
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as HotelRecFile;
  cached = dedupeHotels(Array.isArray(parsed.hotels) ? parsed.hotels : []);
  cachedCitation = parsed.citation?.trim() || CITATION;
  return { hotels: cached, citation: cachedCitation };
}

/** Second half of names like New York or Los Angeles — not a city on its own. */
const COMPOUND_PREFIX = new Set([
  "new",
  "los",
  "las",
  "san",
  "santa",
  "saint",
  "st",
  "hong",
  "tel",
  "abu",
  "kuala",
  "rio",
  "buenos",
  "fort",
  "port",
]);

function normalizePlace(value: string): string {
  return value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cityMatchesLocation(location: string, city: string): boolean {
  const needle = normalizePlace(city).split(" ").filter(Boolean);
  const hay = normalizePlace(location).split(" ").filter(Boolean);
  if (!needle.length || needle.join(" ").length < 3) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    if (!needle.every((token, j) => hay[i + j] === token)) continue;
    if (needle.length === 1 && i > 0 && COMPOUND_PREFIX.has(hay[i - 1])) {
      continue;
    }
    return true;
  }
  return false;
}

export function locationStartsWithCity(location: string, city: string): boolean {
  const needle = normalizePlace(city);
  const hay = normalizePlace(location);
  return hay === needle || hay.startsWith(`${needle} `);
}

function dedupeHotels(hotels: HotelRecord[]): HotelRecord[] {
  const byId = new Map<string, HotelRecord>();
  for (const hotel of hotels) {
    const prev = byId.get(hotel.id);
    if (!prev || hotel.n > prev.n) byId.set(hotel.id, hotel);
  }
  return [...byId.values()];
}

function placeCount(hotel: HotelRecord, place: HotelPlacePreference): number {
  if (place === "any") return 0;
  return hotel[place] ?? 0;
}

export function suggestFromHotels(
  hotels: HotelRecord[],
  input: {
    city: string;
    minRating?: number;
    place?: HotelPlacePreference;
    limit?: number;
  },
): HotelSuggestion[] {
  const minRating = input.minRating ?? 0;
  const place = input.place ?? "any";
  const limit = input.limit ?? 4;
  return dedupeHotels(hotels)
    .filter(
      (hotel) =>
        hotel.rating >= minRating &&
        cityMatchesLocation(hotel.location, input.city) &&
        hotel.quotes?.length,
    )
    .map((hotel) => {
      const mentions = placeCount(hotel, place);
      const mentionRate = hotel.n > 0 ? mentions / hotel.n : 0;
      const score =
        hotel.rating +
        mentionRate * 3 +
        (hotel.locationScore ?? 0) * 0.25 +
        Math.log10(hotel.n + 1) * 0.2;
      return { hotel, score };
    })
    .sort((a, b) => {
      const aCity = locationStartsWithCity(a.hotel.location, input.city) ? 1 : 0;
      const bCity = locationStartsWithCity(b.hotel.location, input.city) ? 1 : 0;
      if (aCity !== bCity) return bCity - aCity;
      return b.score - a.score || b.hotel.n - a.hotel.n;
    })
    .slice(0, limit)
    .map(({ hotel }) => ({
      id: hotel.id,
      name: hotel.name,
      location: hotel.location,
      rating: hotel.rating,
      reviewCount: hotel.n,
      locationScore: hotel.locationScore,
      quotes: hotel.quotes.slice(0, 3),
    }));
}

export function suggestionNote(input: {
  city: string;
  count: number;
  minRating: number;
  place: HotelPlacePreference;
}): string {
  const placeLabel: Record<HotelPlacePreference, string> = {
    any: "overall rating and location sub-ratings",
    center: "city-center mentions in the reviews",
    beach: "beach mentions in the reviews",
    sights: "sight mentions and location sub-ratings",
    transit: "transit mentions in the reviews",
  };
  if (!input.count) {
    return `No hotels in this HotelRec sample match ${input.city} at ${input.minRating.toFixed(1)} stars or higher. Waypoint does not invent hotels or reviews.`;
  }
  return `${input.count} HotelRec hotels match ${input.city} at ${input.minRating.toFixed(1)}+ stars, ranked by ${placeLabel[input.place]}. Names and quotes are copied from the dataset.`;
}

/** Fill an empty unbooked leg with the top HotelRec hotel for that city. */
export function anchorUnbookedLegs<
  T extends {
    city: string;
    hotel?: string;
    hotelAddress?: string;
    hotelBooked?: boolean;
    hotelMinRating?: number;
    hotelPlace?: HotelPlacePreference;
  },
>(legs: T[]): T[] {
  return legs.map((leg) => {
    if (leg.hotelBooked !== false) return leg;
    if (leg.hotel?.trim()) return leg;
    const top = suggestHotels({
      city: leg.city,
      minRating: leg.hotelMinRating,
      place: leg.hotelPlace,
      limit: 1,
    }).hotels[0];
    if (!top) return leg;
    return {
      ...leg,
      hotel: top.name,
      hotelAddress: leg.hotelAddress?.trim() || top.location,
    };
  });
}

export function suggestHotels(input: {
  city: string;
  minRating?: number;
  place?: HotelPlacePreference;
  limit?: number;
}): { citation: string; hotels: HotelSuggestion[] } {
  const { hotels, citation } = loadHotelRec();
  return { citation, hotels: suggestFromHotels(hotels, input) };
}

export function quotesForHotelName(name: string): {
  citation: string;
  hotel: HotelSuggestion | null;
} {
  const cleaned = name.replace(/\(demo\)/gi, "").trim().toLowerCase();
  if (cleaned.length < 4) return { citation: CITATION, hotel: null };
  const { hotels, citation } = loadHotelRec();
  const hit = hotels.find((hotel) => hotel.name.trim().toLowerCase() === cleaned);
  if (!hit) return { citation, hotel: null };
  return {
    citation,
    hotel: {
      id: hit.id,
      name: hit.name,
      location: hit.location,
      rating: hit.rating,
      reviewCount: hit.n,
      locationScore: hit.locationScore,
      quotes: hit.quotes.slice(0, 3),
    },
  };
}
