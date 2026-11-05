import Groq from "groq-sdk";
import { plannerModel } from "@/lib/billing/model";
import {
  accountlessFetch,
  cacheGet,
  cacheSet,
} from "@/lib/http/accountless-fetch";
import { hotelNameMatchScore } from "@/lib/hotels/name-match";

export type OsmHotelInput = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  stars: number | null;
};

export type RankedOsmHotel = OsmHotelInput & {
  score: number;
};

function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const r = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Rank real OSM hotels near a city center. A typed query prefers name matches. */
export function rankOsmHotels(
  hotels: OsmHotelInput[],
  center: { lat: number; lng: number },
  query = "",
): RankedOsmHotel[] {
  const q = query.trim();
  return hotels
    .map((hotel) => {
      const km = distanceKm(center.lat, center.lng, hotel.lat, hotel.lng);
      const stars = hotel.stars ?? 0;
      const nameScore = q ? hotelNameMatchScore(q, hotel.name) : 0;
      if (q && nameScore <= 0) return null;
      const score = nameScore + stars * 25 - km * 3;
      return { ...hotel, score };
    })
    .filter((hotel): hotel is RankedOsmHotel => hotel != null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Pick a hotel from the ranked list without inventing a name. */
export function heuristicHotelPick(hotels: RankedOsmHotel[]): string | null {
  return hotels[0]?.id ?? null;
}

type NominatimHotel = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  type?: string;
  class?: string;
  extratags?: { stars?: string };
  address?: { road?: string; city?: string; town?: string; suburb?: string };
};

let nextNominatimAt = 0;

/**
 * Named hotels near a point from OpenStreetMap (Nominatim).
 * A bounded search stays inside the city and returns in about a second.
 */
export async function listOsmHotelsNear(input: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
}): Promise<OsmHotelInput[]> {
  const radius = input.radiusMeters ?? 8000;
  const limit = Math.min(input.limit ?? 20, 30);
  const cacheKey = `osm-hotels:v2:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}:${radius}:${limit}`;
  const cached = cacheGet<OsmHotelInput[]>(cacheKey);
  if (cached?.length) return cached;

  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((input.lat * Math.PI) / 180));
  const viewbox = [
    input.lng - dLng,
    input.lat + dLat,
    input.lng + dLng,
    input.lat - dLat,
  ].join(",");
  const wait = nextNominatimAt - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  nextNominatimAt = Date.now() + 1100;

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: "hotel",
      viewbox,
      bounded: "1",
      limit: String(Math.min(limit + 8, 40)),
      extratags: "1",
      addressdetails: "1",
    });
    const res = await accountlessFetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { timeoutMs: 12000, retryOnce: false },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as NominatimHotel[];
    const hotels = parseNominatimHotels(rows).slice(0, limit);
    if (!hotels.length) return [];
    cacheSet(cacheKey, hotels, 24 * 60 * 60 * 1000);
    return hotels;
  } catch {
    return [];
  }
}

function parseNominatimHotels(rows: NominatimHotel[]): OsmHotelInput[] {
  const seen = new Set<string>();
  const hotels: OsmHotelInput[] = [];
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name || /^(hotel|hôtel|hotels|hostel)$/i.test(name)) continue;
    if (row.class && row.class !== "tourism") continue;
    if (row.type && !/hotel|guest_house|motel|apartment/i.test(row.type)) continue;
    if (row.osm_id == null || !row.osm_type) continue;
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = `osm:${row.osm_type}:${row.osm_id}`;
    const key = name.toLowerCase();
    if (seen.has(id) || seen.has(key)) continue;
    seen.add(id);
    seen.add(key);
    const parsedStars = Number(row.extratags?.stars);
    const stars =
      Number.isFinite(parsedStars) && parsedStars >= 1 && parsedStars <= 5
        ? parsedStars
        : null;
    const address = [row.address?.road, row.address?.suburb, row.address?.city || row.address?.town]
      .filter(Boolean)
      .join(", ");
    hotels.push({
      id,
      name,
      address: address || null,
      lat,
      lng,
      stars,
    });
  }
  return hotels;
}

/** Choose one id that is already in the list. Groq when configured, else the top rank. */
export async function chooseOsmHotel(
  city: string,
  hotels: RankedOsmHotel[],
): Promise<{ id: string | null; by: "ai" | "ranking" | null }> {
  const fallback = heuristicHotelPick(hotels);
  if (!fallback) return { id: null, by: null };
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { id: fallback, by: "ranking" };
  try {
    const client = new Groq({ apiKey });
    const model = await plannerModel();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "HotelPick",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["id"],
            properties: { id: { type: "string" } },
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Choose one hotel id from the list for a pleasant stay in the city. Prefer a better-known, centrally useful hotel. Return only an id that appears in the list. Do not invent a hotel.",
        },
        {
          role: "user",
          content: JSON.stringify({
            city,
            hotels: hotels.slice(0, 8).map((hotel) => ({
              id: hotel.id,
              name: hotel.name,
              stars: hotel.stars,
              address: hotel.address,
            })),
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { id?: string };
    if (parsed.id && hotels.some((hotel) => hotel.id === parsed.id)) {
      return { id: parsed.id, by: "ai" };
    }
  } catch {
    /* ranked pick */
  }
  return { id: fallback, by: "ranking" };
}
