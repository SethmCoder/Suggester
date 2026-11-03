/**
 * OpenFlights static datasets (no commercial flight API).
 * Sources: https://github.com/jpatokal/openflights/tree/master/data
 */

import { haversineKm } from "@/lib/ai/scheduler";

const RAW = {
  airports:
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat",
  routes:
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat",
  airlines:
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat",
  planes:
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/planes.dat",
  countries:
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/countries.dat",
} as const;

export type OpenFlightsAirport = {
  id: number;
  name: string;
  city: string;
  country: string;
  iata: string;
  icao: string;
  lat: number;
  lng: number;
  /** Hours offset from UTC (OpenFlights field). */
  tzOffsetHours: number;
  tzName: string;
};

export type FlightEstimate = {
  from: OpenFlightsAirport;
  to: OpenFlightsAirport;
  distanceKm: number;
  /** Block time estimate including taxi. */
  durationMinutes: number;
  routeKnown: boolean;
  sampleAirlines: string[];
  /** Assumed local departure at origin (HH:MM). */
  assumedDepartureLocal: string;
  /** Estimated local arrival at destination (HH:MM), may roll past midnight. */
  estimatedArrivalLocal: string;
  /** Days after departure date when you land (0 or 1 typically). */
  arrivalDayOffset: number;
  /** Suggested first activity start after customs/baggage. */
  suggestedDayStart: string;
  note: string;
};

type Cache = {
  airportsByIata: Map<string, OpenFlightsAirport>;
  airportsList: OpenFlightsAirport[];
  /** "SEA-HND" → airline codes that fly the route */
  routes: Map<string, string[]>;
  airlineNames: Map<string, string>;
  loadedAt: number;
};

const GLOBAL_KEY = "__waypoint_openflights_cache__";
const TTL_MS = 1000 * 60 * 60 * 24;

function getCache(): Cache | null {
  const g = globalThis as unknown as Record<string, Cache | undefined>;
  const c = g[GLOBAL_KEY];
  if (!c) return null;
  if (Date.now() - c.loadedAt > TTL_MS) return null;
  return c;
}

function setCache(c: Cache) {
  const g = globalThis as unknown as Record<string, Cache | undefined>;
  g[GLOBAL_KEY] = c;
}

/** CSV-ish OpenFlights lines: fields may be quoted. */
function parseDatLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "WaypointItinerary/1.0" },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenFlights fetch failed: ${url} (${res.status})`);
  return res.text();
}

export async function loadOpenFlights(): Promise<Cache> {
  const existing = getCache();
  if (existing) return existing;

  const [airportsRaw, routesRaw, airlinesRaw] = await Promise.all([
    fetchText(RAW.airports),
    fetchText(RAW.routes),
    fetchText(RAW.airlines),
  ]);

  const airportsByIata = new Map<string, OpenFlightsAirport>();
  const airportsList: OpenFlightsAirport[] = [];

  for (const line of airportsRaw.split("\n")) {
    if (!line.trim()) continue;
    const f = parseDatLine(line);
    const iata = (f[4] ?? "").trim().toUpperCase();
    if (!iata || iata === "\\N" || iata.length !== 3) continue;
    const lat = Number(f[6]);
    const lng = Number(f[7]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const tzOffset = Number(f[9]);
    const airport: OpenFlightsAirport = {
      id: Number(f[0]),
      name: f[1] || iata,
      city: f[2] || "",
      country: f[3] || "",
      iata,
      icao: f[5] === "\\N" ? "" : f[5] || "",
      lat,
      lng,
      tzOffsetHours: Number.isFinite(tzOffset) ? tzOffset : 0,
      tzName: f[11] && f[11] !== "\\N" ? f[11] : "",
    };
    // Prefer larger/primary if duplicate IATA (keep first with a city name)
    if (!airportsByIata.has(iata) || (!airportsByIata.get(iata)!.city && airport.city)) {
      airportsByIata.set(iata, airport);
    }
    airportsList.push(airport);
  }

  const airlineNames = new Map<string, string>();
  for (const line of airlinesRaw.split("\n")) {
    if (!line.trim()) continue;
    const f = parseDatLine(line);
    const code = (f[3] ?? "").trim().toUpperCase();
    const name = f[1] || code;
    const active = (f[7] ?? "").toUpperCase() === "Y";
    if (!code || code === "\\N" || code.length > 3) continue;
    if (active || !airlineNames.has(code)) airlineNames.set(code, name);
  }

  const routes = new Map<string, string[]>();
  for (const line of routesRaw.split("\n")) {
    if (!line.trim()) continue;
    const f = parseDatLine(line);
    const airline = (f[0] ?? "").trim().toUpperCase();
    const src = (f[2] ?? "").trim().toUpperCase();
    const dst = (f[4] ?? "").trim().toUpperCase();
    if (src.length !== 3 || dst.length !== 3) continue;
    const key = `${src}-${dst}`;
    const list = routes.get(key) ?? [];
    if (airline && !list.includes(airline)) list.push(airline);
    routes.set(key, list);
  }

  const cache: Cache = {
    airportsByIata,
    airportsList,
    routes,
    airlineNames,
    loadedAt: Date.now(),
  };
  setCache(cache);
  return cache;
}

export async function findAirport(
  query: string,
): Promise<OpenFlightsAirport | null> {
  const q = query.trim();
  if (!q) return null;
  const cache = await loadOpenFlights();
  const upper = q.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) {
    return cache.airportsByIata.get(upper) ?? null;
  }
  const lower = q.toLowerCase();
  // Exact city match first
  let hit =
    cache.airportsList.find(
      (a) => a.city.toLowerCase() === lower || a.name.toLowerCase() === lower,
    ) ?? null;
  if (hit) return cache.airportsByIata.get(hit.iata) ?? hit;
  hit =
    cache.airportsList.find(
      (a) =>
        a.city.toLowerCase().includes(lower) ||
        a.name.toLowerCase().includes(lower) ||
        a.iata.toLowerCase() === lower,
    ) ?? null;
  return hit ? cache.airportsByIata.get(hit.iata) ?? hit : null;
}

export async function searchAirports(
  query: string,
  limit = 8,
): Promise<OpenFlightsAirport[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const cache = await loadOpenFlights();
  if (/^[a-z]{3}$/.test(q)) {
    const exact = cache.airportsByIata.get(q.toUpperCase());
    return exact ? [exact] : [];
  }
  const scored: { a: OpenFlightsAirport; score: number }[] = [];
  const seen = new Set<string>();
  for (const a of cache.airportsList) {
    if (seen.has(a.iata)) continue;
    const city = a.city.toLowerCase();
    const name = a.name.toLowerCase();
    let score = 0;
    if (a.iata.toLowerCase() === q) score = 100;
    else if (city === q) score = 90;
    else if (city.startsWith(q)) score = 70;
    else if (name.startsWith(q)) score = 60;
    else if (city.includes(q) || name.includes(q)) score = 40;
    else continue;
    seen.add(a.iata);
    scored.push({ a: cache.airportsByIata.get(a.iata) ?? a, score });
  }
  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((s) => s.a);
}

/** Cruise ~830 km/h + 40m taxi/climb/descent; long-haul slightly slower effective. */
export function estimateBlockMinutes(distanceKm: number): number {
  const cruiseKmh = distanceKm > 5000 ? 870 : distanceKm > 1500 ? 830 : 700;
  const airMin = (distanceKm / cruiseKmh) * 60;
  const taxi = distanceKm > 3000 ? 50 : 35;
  return Math.round(airMin + taxi);
}

function minutesToHHMM(total: number): { time: string; dayOffset: number } {
  let m = total;
  let dayOffset = 0;
  while (m < 0) {
    m += 24 * 60;
    dayOffset -= 1;
  }
  while (m >= 24 * 60) {
    m -= 24 * 60;
    dayOffset += 1;
  }
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return {
    time: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    dayOffset,
  };
}

/**
 * Estimate inbound arrival using OpenFlights airports + route existence.
 * Default departure: late morning at origin (typical long-haul) or noon.
 */
export async function estimateFlight(input: {
  from: string;
  to: string;
  /** Local departure HH:MM at origin; default chosen from distance. */
  departureLocal?: string;
  /** Customs / baggage buffer minutes after landing. */
  arrivalBufferMinutes?: number;
}): Promise<FlightEstimate | null> {
  const from = await findAirport(input.from);
  const to = await findAirport(input.to);
  if (!from || !to) return null;

  const cache = await loadOpenFlights();
  const key = `${from.iata}-${to.iata}`;
  const airlineCodes = cache.routes.get(key) ?? [];
  const routeKnown = airlineCodes.length > 0;
  const sampleAirlines = airlineCodes
    .slice(0, 5)
    .map((c) => cache.airlineNames.get(c) ?? c);

  const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const durationMinutes = estimateBlockMinutes(distanceKm);

  // Prefer evening dep for very long eastbound, otherwise ~11:00 local.
  const assumedDepartureLocal =
    input.departureLocal ??
    (distanceKm > 6000 ? "13:00" : distanceKm > 2500 ? "10:00" : "09:00");

  const [dh, dm] = assumedDepartureLocal.split(":").map(Number);
  const depLocalMin = dh * 60 + dm;
  // Universal minutes: local - offset
  const depUniversal =
    depLocalMin - from.tzOffsetHours * 60;
  const arrUniversal = depUniversal + durationMinutes;
  const arrLocalTotal = arrUniversal + to.tzOffsetHours * 60;
  const { time: estimatedArrivalLocal, dayOffset: arrivalDayOffset } =
    minutesToHHMM(arrLocalTotal);

  const buffer = input.arrivalBufferMinutes ?? 75;
  const ready = minutesToHHMM(
    (() => {
      const [ah, am] = estimatedArrivalLocal.split(":").map(Number);
      return ah * 60 + am + buffer;
    })(),
  );
  // If buffer crosses midnight, fold into day offset note only for dayStart same calendar arrival day.
  const suggestedDayStart = ready.time;

  const note = routeKnown
    ? `OpenFlights lists ${airlineCodes.length} airline route(s) ${from.iata}→${to.iata}. Times are estimates (no live schedules).`
    : `No published OpenFlights route ${from.iata}→${to.iata}; duration is great-circle estimate only.`;

  return {
    from,
    to,
    distanceKm: Math.round(distanceKm),
    durationMinutes,
    routeKnown,
    sampleAirlines,
    assumedDepartureLocal,
    estimatedArrivalLocal,
    arrivalDayOffset,
    suggestedDayStart,
    note,
  };
}

export async function listRoutesFrom(iata: string, limit = 40) {
  const cache = await loadOpenFlights();
  const origin = iata.trim().toUpperCase();
  const out: { to: string; airlines: string[] }[] = [];
  for (const [key, airlines] of cache.routes) {
    if (!key.startsWith(`${origin}-`)) continue;
    const to = key.slice(4);
    out.push({ to, airlines: airlines.slice(0, 5) });
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => a.to.localeCompare(b.to));
}

/** Exposed for tests / diagnostics — does not fetch planes/countries unless needed. */
export function openFlightsUrls() {
  return RAW;
}
