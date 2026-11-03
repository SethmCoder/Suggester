import type { TripLeg } from "@/lib/types/trip";

export type DayCityAssignment = {
  dayIndex: number;
  city: string;
  legIndex: number;
  /** True when this day starts with intercity travel from the previous leg. */
  isArrivalTransitDay: boolean;
  previousCity: string | null;
  hotel?: string;
  anchorLat: number;
  anchorLng: number;
};

/** Expand ordered legs into per-day city/hotel anchors. */
export function expandLegsToDays(legs: TripLeg[]): DayCityAssignment[] {
  const out: DayCityAssignment[] = [];
  let dayIndex = 0;
  for (let legIndex = 0; legIndex < legs.length; legIndex++) {
    const leg = legs[legIndex];
    const days = Math.max(1, Math.floor(leg.days) || 1);
    const anchorLat = leg.hotelLat ?? leg.lat ?? 0;
    const anchorLng = leg.hotelLng ?? leg.lng ?? 0;
    for (let d = 0; d < days; d++) {
      out.push({
        dayIndex,
        city: leg.city,
        legIndex,
        isArrivalTransitDay: legIndex > 0 && d === 0,
        previousCity: legIndex > 0 ? legs[legIndex - 1].city : null,
        hotel: leg.hotel,
        anchorLat,
        anchorLng,
      });
      dayIndex += 1;
    }
  }
  return out;
}

export function legsLabel(legs: TripLeg[]): string {
  return legs
    .map((l) => `${l.city} (${l.days}d)`)
    .join(" → ");
}

/** Haversine km for intercity transit estimates. */
export function haversineKm(
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

/** Rough train/car block time between cities (no live timetable). */
export function estimateIntercityMinutes(distanceKm: number): number {
  // ~90 km/h average including transfers for medium European hops
  const cruise = distanceKm > 800 ? 200 : 90; // high-speed vs regional blend
  return Math.round((distanceKm / cruise) * 60 + 45);
}
