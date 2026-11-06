import type { ExplorerDay, ExplorerPlace, ExplorerPreferences } from "./types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function emptyPreferences(): ExplorerPreferences {
  return { cuisine: "", pace: "", avoid: "", atmosphere: "" };
}

export function mergePreferences(
  current: ExplorerPreferences,
  next: Partial<ExplorerPreferences> | null | undefined,
): ExplorerPreferences {
  const base = { ...emptyPreferences(), ...current };
  if (!next) return base;
  for (const key of ["cuisine", "pace", "avoid", "atmosphere"] as const) {
    const value = next[key];
    if (typeof value === "string" && value.trim()) base[key] = value.trim().slice(0, 80);
  }
  return base;
}

export function keepKnownPlaces(
  picks: { id?: unknown; why?: unknown }[],
  places: ExplorerPlace[],
): ExplorerPlace[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const seen = new Set<string>();
  const kept: ExplorerPlace[] = [];
  for (const pick of picks) {
    if (typeof pick.id !== "string" || seen.has(pick.id)) continue;
    const place = byId.get(pick.id);
    if (!place) continue;
    seen.add(pick.id);
    const why = typeof pick.why === "string" ? pick.why.trim().slice(0, 280) : "";
    kept.push({ ...place, why: why || place.why });
    if (kept.length >= 8) break;
  }
  return kept;
}

function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function keepKnownPlan(
  days: { title?: unknown; stops?: { placeId?: unknown; startTime?: unknown; durationMinutes?: unknown; note?: unknown }[] }[],
  places: ExplorerPlace[],
): ExplorerDay[] {
  const ids = new Set(places.map((place) => place.id));
  const used = new Set<string>();
  const plan: ExplorerDay[] = [];
  for (const day of days.slice(0, 7)) {
    const stops = [];
    let last = 8 * 60;
    for (const stop of day.stops ?? []) {
      if (typeof stop.placeId !== "string" || !ids.has(stop.placeId) || used.has(stop.placeId)) {
        continue;
      }
      const start = typeof stop.startTime === "string" && TIME.test(stop.startTime) ? stop.startTime : "";
      if (!start) continue;
      const at = minutes(start);
      if (at < 8 * 60 || at > 21 * 60 || at < last) continue;
      const duration = Math.min(180, Math.max(45, Number(stop.durationMinutes) || 75));
      used.add(stop.placeId);
      stops.push({
        placeId: stop.placeId,
        startTime: start,
        durationMinutes: duration,
        travelMinutes: 0,
        note: typeof stop.note === "string" ? stop.note.trim().slice(0, 180) : "",
      });
      last = at + duration;
      if (stops.length >= 6) break;
    }
    if (!stops.length) continue;
    plan.push({
      title: typeof day.title === "string" && day.title.trim() ? day.title.trim().slice(0, 80) : `Day ${plan.length + 1}`,
      stops,
    });
  }
  return plan;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Estimated transit, labeled as an estimate by the caller. About 18 km/h in a city. */
export function withTravelEstimates(days: ExplorerDay[], places: ExplorerPlace[]): ExplorerDay[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  return days.map((day) => ({
    ...day,
    stops: day.stops.map((stop, index) => {
      if (index === 0) return { ...stop, travelMinutes: 0 };
      const prev = byId.get(day.stops[index - 1].placeId);
      const next = byId.get(stop.placeId);
      if (!prev || !next) return stop;
      const km = haversineKm(prev.lat, prev.lng, next.lat, next.lng);
      return { ...stop, travelMinutes: Math.max(5, Math.round((km / 18) * 60)) };
    }),
  }));
}
