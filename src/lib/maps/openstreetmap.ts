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
  const deg = input.radiusMeters / 111_320;
  const dLng =
    input.radiusMeters /
    (111_320 * Math.max(0.2, Math.cos((input.centerLat * Math.PI) / 180)));
  const viewbox = [
    input.centerLng - dLng,
    input.centerLat + deg,
    input.centerLng + dLng,
    input.centerLat - deg,
  ].join(",");
  const params = new URLSearchParams({
    q: input.query,
    format: "json",
    limit: "8",
    addressdetails: "1",
    viewbox,
    bounded: "1",
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
    osm_type?: string;
    osm_id?: number;
    lat: string;
    lon: string;
    display_name: string;
    type?: string;
    class?: string;
  }[];

  for (const hit of data) {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const dist = haversineKm(input.centerLat, input.centerLng, lat, lng);
    if (dist > input.radiusMeters / 1000) continue;
    // Prefer stable OSM type/id — Nominatim place_id is NOT an OSM node id
    // and caused wrong-country detail lookups.
    const osmType = (hit.osm_type || "").toLowerCase();
    const osmId = hit.osm_id;
    const placeId =
      osmType && osmId
        ? `osm:${osmType}:${osmId}`
        : `osm:nominatim:${hit.place_id}`;
    return {
      placeId,
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

  // Overpass-discovered ids: osm:node:123 / osm:way:456 / osm:relation:789
  const typed = placeId.match(/^osm:(node|way|relation):(\d+)$/i);
  if (typed) {
    const osmType = typed[1].toLowerCase();
    const osmId = typed[2];
    try {
      const q = `[out:json][timeout:15];${osmType}(${osmId});out center tags;`;
      const res = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
        {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: AbortSignal.timeout(18000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          elements?: {
            lat?: number;
            lon?: number;
            center?: { lat: number; lon: number };
            tags?: Record<string, string>;
          }[];
        };
        const el = data.elements?.[0];
        if (el) {
          const tags = el.tags ?? {};
          const lat = el.lat ?? el.center?.lat ?? 0;
          const lng = el.lon ?? el.center?.lon ?? 0;
          const name = tags.name ?? placeId;
          const oh = tags.opening_hours;
          return {
            placeId,
            displayName: name,
            lat,
            lng,
            types: [
              tags.tourism,
              tags.amenity,
              tags.historic,
              tags.leisure,
              "osm",
            ].filter(Boolean) as string[],
            formattedAddress: [
              tags["addr:street"],
              tags["addr:city"],
            ]
              .filter(Boolean)
              .join(", "),
            websiteUri: tags.website ?? tags["contact:website"],
            googleMapsUri: `https://www.openstreetmap.org/${osmType}/${osmId}`,
            hoursVerified: Boolean(oh),
            regularOpeningHours: oh
              ? { weekdayDescriptions: [oh], osmOpeningHours: oh }
              : undefined,
          };
        }
      }
    } catch {
      /* fall through to nominatim */
    }
  }

  const nominatimId = placeId.replace(/^osm:(node|way|relation):/i, "").replace(
    /^osm:/,
    "",
  );

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

function osrmProfile(mode: "WALK" | "DRIVE" | "TRANSIT") {
  // Foot/car follow the real path network (bridges, embankments, one-ways).
  // Public OSRM has no GTFS transit — use foot as the city-transfer proxy.
  return mode === "DRIVE" ? "car" : "foot";
}

/**
 * Crow-flies fallback with a detour factor — never trusts raw straight-line
 * time when a river/park may force a longer path. Prefer OSRM whenever possible.
 */
export function estimateTravelFallback(
  mode: "WALK" | "DRIVE" | "TRANSIT",
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { durationMinutes: number; distanceMeters: number } {
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
  // Urban path networks are rarely straight; 1.4–1.6× reduces “across the river” optimism
  const detour = mode === "WALK" ? 1.55 : 1.35;
  const pathKm = km * detour;
  const speedKmh = mode === "WALK" ? 4.5 : mode === "TRANSIT" ? 18 : 28;
  return {
    durationMinutes: Math.max(3, Math.ceil((pathKm / speedKmh) * 60)),
    distanceMeters: Math.round(pathKm * 1000),
  };
}

/** OSRM public routing — follows roads/paths (bridges, not water diagonals). */
export async function osmComputeDayRoute(input: {
  mode: "WALK" | "DRIVE" | "TRANSIT";
  points: { lat: number; lng: number }[];
}): Promise<DayRouteResult | null> {
  if (input.points.length < 2) {
    return {
      legs: [],
      totalDurationMinutes: 0,
      totalDistanceMeters: 0,
      source: "osrm",
    };
  }

  const profile = osrmProfile(input.mode);
  const coords = input.points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=false&steps=false`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        code?: string;
        routes?: {
          duration?: number;
          distance?: number;
          legs?: { duration?: number; distance?: number }[];
        }[];
      };
      const route = data.routes?.[0];
      if (route?.legs?.length) {
        // Cap absurd OSRM legs (bad snaps / ferry loops) so the day clock
        // is not wiped by multi-day "transfers" inside one city.
        const maxLegMin = input.mode === "WALK" ? 75 : input.mode === "TRANSIT" ? 90 : 120;
        const legs = route.legs.map((leg, i) => {
          const rawMin = Math.max(1, Math.ceil((leg.duration ?? 0) / 60));
          if (rawMin <= maxLegMin) {
            return {
              durationMinutes: rawMin,
              distanceMeters: Math.round(leg.distance ?? 0),
              routed: true as const,
            };
          }
          const est = estimateTravelFallback(
            input.mode,
            input.points[i],
            input.points[i + 1],
          );
          return {
            durationMinutes: Math.min(maxLegMin, est.durationMinutes),
            distanceMeters: est.distanceMeters,
            routed: false as const,
          };
        });
        return {
          legs,
          totalDurationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
          totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
          source: "osrm",
        };
      }
    }
  } catch {
    /* fall through to estimate */
  }

  // Fallback: never leave travel at 0 — use detoured straight-line estimate
  const legs = [];
  let totalM = 0;
  let totalMin = 0;
  for (let i = 0; i < input.points.length - 1; i++) {
    const est = estimateTravelFallback(
      input.mode,
      input.points[i],
      input.points[i + 1],
    );
    legs.push({ ...est, routed: false as const });
    totalM += est.distanceMeters;
    totalMin += est.durationMinutes;
  }
  return {
    legs,
    totalDurationMinutes: totalMin,
    totalDistanceMeters: totalM,
    source: "estimate",
  };
}

/**
 * OSRM duration matrix — used to sequence stops by real path time so a
 * near bank across a river is not treated as “next door.”
 */
export async function osmDurationMatrix(input: {
  mode: "WALK" | "DRIVE" | "TRANSIT";
  points: { lat: number; lng: number }[];
}): Promise<number[][] | null> {
  if (input.points.length < 2) return null;
  // Public demo server: keep matrices small
  if (input.points.length > 12) return null;

  const profile = osrmProfile(input.mode);
  const coords = input.points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/${profile}/${coords}?annotations=duration`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      durations?: (number | null)[][];
    };
    if (!data.durations?.length) return null;
    return data.durations.map((row) =>
      row.map((sec) =>
        sec == null || !Number.isFinite(sec)
          ? Number.POSITIVE_INFINITY
          : sec / 60,
      ),
    );
  } catch {
    return null;
  }
}
