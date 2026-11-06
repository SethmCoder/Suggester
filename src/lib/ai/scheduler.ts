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

export function orderByNearestNeighbor<T extends { lat: number; lng: number }>(
  items: T[],
  start?: { lat: number; lng: number },
): T[] {
  if (items.length <= 1) return items;
  const remaining = [...items];
  const ordered: T[] = [];
  let currentPt: { lat: number; lng: number } =
    start ?? { lat: remaining[0].lat, lng: remaining[0].lng };
  if (!start) {
    ordered.push(remaining.shift()!);
  }

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(
        currentPt.lat,
        currentPt.lng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    currentPt = next;
    ordered.push(next);
  }
  return ordered;
}

/**
 * Order stops by real path duration (OSRM), not crow-flies distance.
 * Two places across a river sort far apart if the bridge is a long detour.
 */
export async function orderByRoutedNeighbor<
  T extends { lat: number; lng: number },
>(
  items: T[],
  start: { lat: number; lng: number } | undefined,
  mode: "WALK" | "DRIVE" | "TRANSIT",
): Promise<T[]> {
  if (items.length <= 1) return items;

  const { osmDurationMatrix } = await import("@/lib/maps/openstreetmap");

  const seed: { lat: number; lng: number } = start ?? items[0];
  const rest = start ? [...items] : items.slice(1);
  const points = [seed, ...rest];
  const matrix = await osmDurationMatrix({ mode, points });

  if (!matrix) {
    return orderByNearestNeighbor(items, start);
  }

  const ordered: T[] = start ? [] : [items[0]];
  const remaining = rest.map((_, i) => i);
  let current = 0; // index in `points`

  while (remaining.length) {
    let bestPos = 0;
    let bestMin = Infinity;
    for (let r = 0; r < remaining.length; r++) {
      const pointIdx = remaining[r] + 1;
      const minutes = matrix[current]?.[pointIdx] ?? Infinity;
      if (minutes < bestMin) {
        bestMin = minutes;
        bestPos = r;
      }
    }
    const restIdx = remaining.splice(bestPos, 1)[0];
    ordered.push(rest[restIdx]);
    current = restIdx + 1;
  }

  return ordered;
}

export type ClockStop = {
  placeId: string;
  startTime: string;
  durationMinutes: number;
  travelMinutesFromPrev?: number;
  hoursWindow?: string | null;
};

function clockMinutes(value: string): number {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function clockFrom(total: number): string {
  const minutes = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseWindow(value: string | null | undefined): { open: number; close: number } | null {
  if (!value) return null;
  const match = value.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
  if (!match) return null;
  return { open: clockMinutes(match[1]), close: clockMinutes(match[2]) };
}

/**
 * Move each later stop by its routed travel time, leave one meal gap, and drop
 * anything that would pass the end of the day or a published hours window.
 */
export function fitDayClock<T extends ClockStop>(
  activities: T[],
  options: {
    dayEnd: string;
    mealGapMinutes: number;
    isMeal: (item: T) => boolean;
    anchored: (item: T) => boolean;
  },
): { kept: T[]; dropped: { item: T; reason: string }[] } {
  const dayEnd = clockMinutes(options.dayEnd || "21:00");
  let mealUsed = activities.some((item) => options.isMeal(item));
  const kept: T[] = [];
  const dropped: { item: T; reason: string }[] = [];
  let cursor = 9 * 60;

  for (const item of activities) {
    if (options.anchored(item)) {
      const start = clockMinutes(item.startTime);
      kept.push(item);
      cursor = start + item.durationMinutes;
      continue;
    }
    const travel =
      item.travelMinutesFromPrev && item.travelMinutesFromPrev > 0
        ? item.travelMinutesFromPrev
        : kept.length
          ? 15
          : 0;
    let start = kept.length ? cursor + travel : clockMinutes(item.startTime);
    if (!mealUsed && kept.length > 0 && start >= 12 * 60 && cursor <= 14 * 60) {
      start += options.mealGapMinutes;
      mealUsed = true;
    }
    const window = parseWindow(item.hoursWindow);
    if (window && (start < window.open || start + item.durationMinutes > window.close)) {
      dropped.push({
        item,
        reason: "A stop was dropped because travel time pushed it outside published hours.",
      });
      continue;
    }
    if (start + item.durationMinutes > dayEnd) {
      dropped.push({
        item,
        reason: `A stop was dropped because it would run past ${options.dayEnd.slice(0, 5)} after travel time.`,
      });
      continue;
    }
    kept.push({ ...item, startTime: clockFrom(start) });
    cursor = start + item.durationMinutes;
  }
  return { kept, dropped };
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  let total = h * 60 + m + minutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

/** Apply a minute offset to a stored start_time (HH:MM or HH:MM:SS). */
export function shiftActivityStartTime(
  startTime: string | null,
  shiftMinutes: number,
): string {
  if (!startTime) return `${addMinutes("09:00", shiftMinutes)}:00`;
  const hhmm = startTime.slice(0, 5);
  return `${addMinutes(hhmm, shiftMinutes)}:00`;
}
