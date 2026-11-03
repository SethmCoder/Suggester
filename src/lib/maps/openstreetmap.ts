import type { DayRouteResult, PlaceDetails, PlaceHit } from "./types";

const UA = "WaypointItinerary/1.0 (travel planner; contact: local-dev)";

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Nominatim geocode — free, rate-limited; identify with UA. */
export async function osmGeocode(
  query: string,
): Promise<{ lat: number; lng: number; formatted: string } | null> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
  }[];
  const first = data[0];
  if (!first) return null;
  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    formatted: first.display_name,
  };
}

export async function osmTextSearch(input: {
  query: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}): Promise<PlaceHit | null> {
  const params = new URLSearchParams({
    q: input.query,
    format: "json",
    limit: "5",
    addressdetails: "1",
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    place_id: number;
    lat: string;
    lon: string;
    display_name: string;
    type?: string;
    class?: string;
  }[];

  for (const hit of data) {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    const dist = haversineKm(input.centerLat, input.centerLng, lat, lng);
    if (dist > input.radiusMeters / 1000) continue;
    return {
      placeId: `osm:${hit.place_id}`,
      displayName: hit.display_name.split(",")[0] ?? hit.display_name,
      lat,
      lng,
      types: [hit.class ?? "place", hit.type ?? "point"].filter(Boolean),
      formattedAddress: hit.display_name,
    };
  }
  return null;
}

/** Opening hours from Overpass when OSM tags include opening_hours. */
export async function osmPlaceDetails(
  placeId: string,
): Promise<PlaceDetails | null> {
  if (!placeId.startsWith("osm:")) return null;
  const nominatimId = placeId.replace("osm:", "");

  const lookup = await fetch(
    `https://nominatim.openstreetmap.org/lookup?osm_ids=N${nominatimId},W${nominatimId},R${nominatimId}&format=json&extratags=1`,
    {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    },
  );

  let lat = 0;
  let lng = 0;
  let name = placeId;
  let address = "";
  let website: string | undefined;
  let openingRaw: string | undefined;
  let types: string[] = [];

  if (lookup.ok) {
    const rows = (await lookup.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      type?: string;
      class?: string;
      extratags?: Record<string, string>;
    }[];
    const row = rows[0];
    if (row) {
      lat = Number(row.lat);
      lng = Number(row.lon);
      name = row.display_name.split(",")[0] ?? row.display_name;
      address = row.display_name;
      website = row.extratags?.website ?? row.extratags?.["contact:website"];
      openingRaw = row.extratags?.opening_hours;
      types = [row.class ?? "place", row.type ?? "point"];
    }
  }

  // If lookup by Nominatim place_id failed shape, try reverse from cached search coords via Overpass around name
  if (!lat && !lng) return null;

  let hoursVerified = false;
  let regularOpeningHours: unknown;

  if (openingRaw) {
    hoursVerified = true;
    regularOpeningHours = {
      weekdayDescriptions: [openingRaw],
      osmOpeningHours: openingRaw,
    };
  } else {
    // Overpass nearby amenity with opening_hours
    try {
      const query = `
        [out:json][timeout:15];
        (
          node(around:80,${lat},${lng})["opening_hours"];
          way(around:80,${lat},${lng})["opening_hours"];
        );
        out tags center 1;
      `;
      const overpass = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (overpass.ok) {
        const data = (await overpass.json()) as {
          elements?: { tags?: Record<string, string> }[];
        };
        const oh = data.elements?.[0]?.tags?.opening_hours;
        if (oh) {
          hoursVerified = true;
          regularOpeningHours = {
            weekdayDescriptions: [oh],
            osmOpeningHours: oh,
          };
        }
      }
    } catch {
      /* optional */
    }
  }

  return {
    placeId,
    displayName: name,
    lat,
    lng,
    types,
    formattedAddress: address,
    websiteUri: website,
    googleMapsUri: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
    hoursVerified,
    regularOpeningHours,
  };
}

export async function osmSearchInterestPlaces(input: {
  destination: string;
  centerLat: number;
  centerLng: number;
  interests: string[];
  limit?: number;
}): Promise<PlaceHit[]> {
  const hits: PlaceHit[] = [];
  const queries = input.interests
    .slice(0, 6)
    .map((i) => `${i} ${input.destination}`);
  for (const q of queries) {
    const hit = await osmTextSearch({
      query: q,
      centerLat: input.centerLat,
      centerLng: input.centerLng,
      radiusMeters: 25000,
    });
    if (hit && !hits.some((h) => h.placeId === hit.placeId)) hits.push(hit);
    if (hits.length >= (input.limit ?? 24)) break;
    // Nominatim polite delay
    await new Promise((r) => setTimeout(r, 1100));
  }
  return hits;
}

/** OSRM public routing — free. */
export async function osmComputeDayRoute(input: {
  mode: "WALK" | "DRIVE" | "TRANSIT";
  points: { lat: number; lng: number }[];
}): Promise<DayRouteResult | null> {
  if (input.points.length < 2) {
    return { legs: [], totalDurationMinutes: 0, totalDistanceMeters: 0 };
  }

  const profile =
    input.mode === "WALK" ? "foot" : input.mode === "DRIVE" ? "car" : "foot";
  const coords = input.points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=false&steps=false`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: {
        duration?: number;
        distance?: number;
        legs?: { duration?: number; distance?: number }[];
      }[];
    };
    const route = data.routes?.[0];
    if (!route) return null;
    const legs =
      route.legs?.map((leg) => ({
        durationMinutes: Math.ceil((leg.duration ?? 0) / 60),
        distanceMeters: Math.round(leg.distance ?? 0),
      })) ?? [];
    return {
      legs,
      totalDurationMinutes: Math.ceil((route.duration ?? 0) / 60),
      totalDistanceMeters: Math.round(route.distance ?? 0),
    };
  } catch {
    // Haversine fallback estimates
    const legs = [];
    let totalM = 0;
    let totalMin = 0;
    for (let i = 0; i < input.points.length - 1; i++) {
      const km = haversineKm(
        input.points[i].lat,
        input.points[i].lng,
        input.points[i + 1].lat,
        input.points[i + 1].lng,
      );
      const meters = Math.round(km * 1000);
      const speedKmh = input.mode === "WALK" ? 4.5 : 25;
      const minutes = Math.ceil((km / speedKmh) * 60);
      legs.push({ durationMinutes: minutes, distanceMeters: meters });
      totalM += meters;
      totalMin += minutes;
    }
    return {
      legs,
      totalDurationMinutes: totalMin,
      totalDistanceMeters: totalM,
    };
  }
}
