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
