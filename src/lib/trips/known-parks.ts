import { haversineKm } from "@/lib/ai/scheduler";

export type KnownPark = {
  id: string;
  names: string[];
  displayName: string;
  cityHints: string[];
  lat: number;
  lng: number;
  /** Typical published open/close when traveler didn't override. */
  openTime: string;
  closeTime: string;
  durationMinutes: number;
};

/** Curated theme parks — invent-nothing anchors with stable coords. */
export const KNOWN_PARKS: KnownPark[] = [
  {
    id: "tokyo-disneyland",
    names: ["tokyo disneyland", "disneyland tokyo", "東京ディズニーランド"],
    displayName: "Tokyo Disneyland",
    cityHints: ["tokyo", "maiha", "urayasu", "chiba"],
    lat: 35.6329,
    lng: 139.8804,
    openTime: "09:00",
    closeTime: "21:00",
    durationMinutes: 12 * 60,
  },
  {
    id: "tokyo-disneysea",
    names: ["tokyo disneysea", "disneysea", "東京ディズニーシー"],
    displayName: "Tokyo DisneySea",
    cityHints: ["tokyo", "maiha", "urayasu", "chiba"],
    lat: 35.6267,
    lng: 139.8851,
    openTime: "09:00",
    closeTime: "21:00",
    durationMinutes: 12 * 60,
  },
];

export function matchKnownPark(
  stopName: string,
  destination?: string,
): KnownPark | null {
  const needle = stopName.trim().toLowerCase();
  if (!needle) return null;
  const dest = (destination ?? "").toLowerCase();
  for (const park of KNOWN_PARKS) {
    const nameHit = park.names.some(
      (n) => needle.includes(n) || n.includes(needle),
    );
    if (!nameHit) continue;
    if (
      dest &&
      !park.cityHints.some((h) => dest.includes(h)) &&
      !park.names.some((n) => dest.includes(n))
    ) {
      // Still allow if the stop name itself is unambiguous (e.g. "Tokyo Disneyland").
      if (!/tokyo|ディズニー/.test(needle)) continue;
    }
    return park;
  }
  return null;
}

export function knownParkPlaceId(park: KnownPark): string {
  return `park:${park.id}`;
}

export function knownParkAsHit(park: KnownPark, city: string) {
  return {
    placeId: knownParkPlaceId(park),
    displayName: park.displayName,
    lat: park.lat,
    lng: park.lng,
    types: ["attraction", "theme_park", "tourism"],
    formattedAddress: city,
    openingHours: `${park.openTime}-${park.closeTime}`,
  };
}

/** Parse "Day 2 … Disneyland" style hints from idealTrip / notes. */
export function parkDayAssignmentsFromText(
  text: string,
  mustSee: string[],
  dayCount: number,
): Map<number, KnownPark> {
  const assigned = new Map<number, KnownPark>();
  const blob = `${text}\n${mustSee.join("\n")}`;
  const dayMentions =
    blob.matchAll(
      /\bday\s*(\d+)\b[\s\S]{0,80}?(tokyo\s+disneyland|tokyo\s+disneysea|disneysea|disneyland)/gi,
    );
  for (const m of dayMentions) {
    const dayNum = Number(m[1]);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > dayCount) continue;
    const park = matchKnownPark(m[2] ?? "", blob);
    if (!park) continue;
    const dayIndex = dayNum - 1;
    if (!assigned.has(dayIndex)) assigned.set(dayIndex, park);
  }

  // If idealTrip didn't pin days, assign unmatched must-see parks to free days
  // starting at day 1 (leave day 0 for arrival when possible).
  const usedParks = new Set([...assigned.values()].map((p) => p.id));
  let cursor = dayCount > 1 ? 1 : 0;
  for (const stop of mustSee) {
    const park = matchKnownPark(stop, text);
    if (!park || usedParks.has(park.id)) continue;
    while (cursor < dayCount && assigned.has(cursor)) cursor += 1;
    if (cursor >= dayCount) break;
    assigned.set(cursor, park);
    usedParks.add(park.id);
    cursor += 1;
  }
  return assigned;
}

export function withinCityRadiusKm(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  maxKm: number,
): boolean {
  return haversineKm(center.lat, center.lng, lat, lng) <= maxKm;
}
