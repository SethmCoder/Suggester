import { canUseSku, incrementSku } from "./api-usage";
import { getCachedRoute, setCachedRoute } from "./cache";

export interface RouteLeg {
  durationMinutes: number;
  distanceMeters: number;
  encodedPolyline?: string;
}

export interface DayRouteResult {
  legs: RouteLeg[];
  totalDurationMinutes: number;
  totalDistanceMeters: number;
  polyline?: string;
}

function cacheKey(
  mode: string,
  points: { lat: number; lng: number }[],
): string {
  const rounded = points.map(
    (p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`,
  );
  return `${mode}:${rounded.join(">")}`;
}

export async function computeDayRoute(input: {
  mode: "WALK" | "DRIVE" | "TRANSIT";
  points: { lat: number; lng: number }[];
}): Promise<DayRouteResult | null> {
  if (input.points.length < 2) {
    return {
      legs: [],
      totalDurationMinutes: 0,
      totalDistanceMeters: 0,
    };
  }

  const key = cacheKey(input.mode, input.points);
  const cached = await getCachedRoute(key);
  if (cached) return cached as DayRouteResult;

  if (!(await canUseSku("routes.compute.essentials"))) return null;

  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return null;

  const travelMode =
    input.mode === "WALK"
      ? "WALK"
      : input.mode === "TRANSIT"
        ? "TRANSIT"
        : "DRIVE";

  if (travelMode === "TRANSIT") {
    const legs: RouteLeg[] = [];
    let totalDurationMinutes = 0;
    let totalDistanceMeters = 0;
    for (let i = 0; i < input.points.length - 1; i++) {
      const leg = await computeSingleRoute(
        serverKey,
        input.points[i],
        input.points[i + 1],
        travelMode,
      );
      if (!leg) continue;
      legs.push(leg);
      totalDurationMinutes += leg.durationMinutes;
      totalDistanceMeters += leg.distanceMeters;
    }
    const result = { legs, totalDurationMinutes, totalDistanceMeters };
    await incrementSku("routes.compute.essentials", legs.length);
    await setCachedRoute(key, result);
    return result;
  }

  const origin = input.points[0];
  const destination = input.points[input.points.length - 1];
  const intermediates = input.points.slice(1, -1).map((p) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lng } },
  }));

  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lng },
      },
    },
    intermediates,
    travelMode,
  };

  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": serverKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!res.ok) return null;
  await incrementSku("routes.compute.essentials");

  const data = (await res.json()) as {
    routes?: {
      duration?: string;
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      legs?: { duration?: string; distanceMeters?: number }[];
    }[];
  };

  const route = data.routes?.[0];
  if (!route) return null;

  const parseDur = (d?: string) => {
    if (!d) return 0;
    const m = d.match(/(\d+)s/);
    return m ? Math.ceil(Number(m[1]) / 60) : 0;
  };

  const legs: RouteLeg[] =
    route.legs?.map((leg) => ({
      durationMinutes: parseDur(leg.duration),
      distanceMeters: leg.distanceMeters ?? 0,
    })) ??
    input.points.slice(1).map(() => ({
      durationMinutes: parseDur(route.duration) / Math.max(1, input.points.length - 1),
      distanceMeters: (route.distanceMeters ?? 0) / Math.max(1, input.points.length - 1),
    }));

  const result: DayRouteResult = {
    legs,
    totalDurationMinutes: parseDur(route.duration),
    totalDistanceMeters: route.distanceMeters ?? 0,
    polyline: route.polyline?.encodedPolyline,
  };

  await setCachedRoute(key, result);
  return result;
}

async function computeSingleRoute(
  key: string,
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  travelMode: string,
): Promise<RouteLeg | null> {
  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
        destination: {
          location: { latLng: { latitude: b.lat, longitude: b.lng } },
        },
        travelMode,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: { duration?: string; distanceMeters?: number }[];
  };
  const route = data.routes?.[0];
  if (!route) return null;
  const sec = route.duration?.match(/(\d+)s/);
  return {
    durationMinutes: sec ? Math.ceil(Number(sec[1]) / 60) : 0,
    distanceMeters: route.distanceMeters ?? 0,
  };
}
