import { haversineKm } from "./scheduler";

/** Max crow-flies span for a single sightseeing day (keeps days walkable / one-rail). */
export function sameDayRadiusKm(
  transport?: string | null,
  maxWalkMinutes?: number | null,
): number {
  if (transport === "driving") return 10;
  if (transport === "transit") return 6.5;
  // Walking: ~4 km default, or derive from walk budget (~80 m/min).
  if (maxWalkMinutes != null && maxWalkMinutes > 0) {
    return Math.min(5, Math.max(2.5, (maxWalkMinutes * 0.08) * 3));
  }
  return 4;
}

export type NeighborhoodPoint = {
  placeId: string;
  lat: number;
  lng: number;
  rank?: number;
  city?: string | null;
};

/**
 * One neighborhood seed per day in a city (farthest-first), so consecutive days
 * cover different areas instead of bouncing citywide every day.
 */
export function assignDayNeighborhoodSeeds(
  dayPlan: { dayIndex: number; city: string }[],
  candidates: NeighborhoodPoint[],
  hotelByCity: Map<string, { lat: number; lng: number }>,
): Map<number, { lat: number; lng: number }> {
  const seeds = new Map<number, { lat: number; lng: number }>();
  const byCity = new Map<string, { dayIndex: number; city: string }[]>();
  for (const day of dayPlan) {
    const list = byCity.get(day.city) ?? [];
    list.push(day);
    byCity.set(day.city, list);
  }

  for (const [city, days] of byCity) {
    const pool = candidates
      .filter(
        (c) =>
          (!c.city || c.city === city) &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng),
      )
      .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));

    const hotel = hotelByCity.get(city);
    const picked: { lat: number; lng: number }[] = [];

    // Day 0 always stays on the hotel when we have one — later days spread out.
    if (hotel) {
      picked.push(hotel);
    } else if (pool[0]) {
      picked.push({ lat: pool[0].lat, lng: pool[0].lng });
    }

    const top = pool.slice(0, Math.max(24, days.length * 8));
    while (picked.length < days.length && top.length) {
      let best: NeighborhoodPoint | null = null;
      let bestScore = -1;
      for (const cand of top) {
        const minDist = Math.min(
          ...picked.map((p) => haversineKm(p.lat, p.lng, cand.lat, cand.lng)),
        );
        // Prefer spread, but keep quality in the mix.
        const score = minDist + (cand.rank ?? 0) * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
      if (!best) break;
      picked.push({ lat: best.lat, lng: best.lng });
      const id = best.placeId;
      const idx = top.findIndex((c) => c.placeId === id);
      if (idx >= 0) top.splice(idx, 1);
    }

    const ordered = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
    ordered.forEach((day, i) => {
      const seed = picked[Math.min(i, picked.length - 1)];
      if (seed) seeds.set(day.dayIndex, seed);
    });
  }

  return seeds;
}

/** Prefer candidates near the day seed; widen radius until the pool is usable. */
export function neighborhoodPool<T extends { lat: number; lng: number }>(
  pool: T[],
  anchor: { lat: number; lng: number },
  radiusKm: number,
  minCount: number,
): T[] {
  const scored = pool
    .map((item) => ({
      item,
      km: haversineKm(anchor.lat, anchor.lng, item.lat, item.lng),
    }))
    .sort((a, b) => a.km - b.km);

  const multipliers = [1, 1.4, 1.85, 2.4, 99];
  for (const mult of multipliers) {
    const capped = scored.filter((row) => row.km <= radiusKm * mult);
    if (capped.length >= minCount || mult === 99) {
      return capped.map((row) => row.item);
    }
  }
  return scored.map((row) => row.item);
}

/** Drop AI picks that sit far outside the day's neighborhood (must-sees keep a longer leash). */
export function filterActsToNeighborhood<
  T extends { placeId: string; priority?: string },
>(
  acts: T[],
  byId: Map<string, { lat: number; lng: number }>,
  anchor: { lat: number; lng: number },
  radiusKm: number,
): T[] {
  const soft = radiusKm * 1.35;
  const hard = radiusKm * 2.2;
  return acts.filter((act) => {
    const hit = byId.get(act.placeId);
    if (!hit) return false;
    const km = haversineKm(anchor.lat, anchor.lng, hit.lat, hit.lng);
    if (act.priority === "must_see") return km <= hard;
    return km <= soft;
  });
}

/** Avoid variety swaps that yank the route across the city. */
export function varietyPickIndex<T extends { lat: number; lng: number; priority?: string }>(
  leftover: T[],
  prev: T | null,
  prevBucket: string,
  bucketOf: (item: T) => string,
  maxJumpKm: number,
): number {
  if (!leftover.length) return 0;
  let fallback = 0;
  for (let i = 0; i < leftover.length; i++) {
    const item = leftover[i];
    const jump = prev
      ? haversineKm(prev.lat, prev.lng, item.lat, item.lng)
      : 0;
    if (prev && jump > maxJumpKm && leftover.length > 1) {
      if (fallback === 0) fallback = i;
      continue;
    }
    const bucket = bucketOf(item);
    if (bucket !== prevBucket || item.priority === "must_see") {
      return i;
    }
  }
  // Closest leftover to previous stop when variety has nowhere local to go.
  if (prev) {
    let best = 0;
    let bestKm = Infinity;
    leftover.forEach((item, i) => {
      const km = haversineKm(prev.lat, prev.lng, item.lat, item.lng);
      if (km < bestKm) {
        bestKm = km;
        best = i;
      }
    });
    return best;
  }
  return fallback;
}

export function centroidOf(
  points: { lat: number; lng: number }[],
): { lat: number; lng: number } | null {
  if (!points.length) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}
