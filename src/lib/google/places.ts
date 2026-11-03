const SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY;

export interface PlaceHit {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  types: string[];
  formattedAddress?: string;
}

export interface PlaceDetails extends PlaceHit {
  regularOpeningHours?: unknown;
  websiteUri?: string;
  googleMapsUri?: string;
  photoName?: string;
  hoursVerified: boolean;
  userRatingCount?: number;
}

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

export async function geocodeDestination(
  query: string,
): Promise<{ lat: number; lng: number; formatted: string } | null> {
  if (!SERVER_KEY) return null;
  const params = new URLSearchParams({ address: query, key: SERVER_KEY });
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: { geometry: { location: { lat: number; lng: number } }; formatted_address: string }[];
  };
  const first = data.results?.[0];
  if (!first) return null;
  return {
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    formatted: first.formatted_address,
  };
}

export async function textSearchPlace(input: {
  query: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}): Promise<PlaceHit | null> {
  if (!SERVER_KEY) return null;
  const body = {
    textQuery: input.query,
    locationBias: {
      circle: {
        center: { latitude: input.centerLat, longitude: input.centerLng },
        radius: input.radiusMeters,
      },
    },
  };
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": SERVER_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types,places.formattedAddress",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
      types?: string[];
      formattedAddress?: string;
    }[];
  };
  const p = data.places?.[0];
  if (!p?.id || !p.location?.latitude || !p.location?.longitude) return null;
  const dist = haversineKm(
    input.centerLat,
    input.centerLng,
    p.location.latitude,
    p.location.longitude,
  );
  if (dist > input.radiusMeters / 1000) return null;
  return {
    placeId: p.id,
    displayName: p.displayName?.text ?? input.query,
    lat: p.location.latitude,
    lng: p.location.longitude,
    types: p.types ?? [],
    formattedAddress: p.formattedAddress,
  };
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const { getCachedPlaceDetails, setCachedPlaceDetails } = await import(
    "./cache"
  );
  const cached = await getCachedPlaceDetails(placeId);
  if (cached) return cached;

  const { canUseSku, incrementSku } = await import("./api-usage");
  if (!(await canUseSku("places.details.enterprise"))) {
    return cached;
  }

  if (!SERVER_KEY) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": SERVER_KEY,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,types,regularOpeningHours,websiteUri,googleMapsUri,photos,userRatingCount",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const p = (await res.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    types?: string[];
    regularOpeningHours?: unknown;
    websiteUri?: string;
    googleMapsUri?: string;
    photos?: { name?: string }[];
    userRatingCount?: number;
  };
  if (!p.id || !p.location?.latitude || !p.location?.longitude) return null;
  await incrementSku("places.details.enterprise");
  const details: PlaceDetails = {
    placeId: p.id,
    displayName: p.displayName?.text ?? p.id,
    lat: p.location.latitude,
    lng: p.location.longitude,
    types: p.types ?? [],
    formattedAddress: p.formattedAddress,
    regularOpeningHours: p.regularOpeningHours,
    websiteUri: p.websiteUri,
    googleMapsUri: p.googleMapsUri,
    photoName: p.photos?.[0]?.name,
    hoursVerified: Boolean(p.regularOpeningHours),
    userRatingCount: p.userRatingCount,
  };
  await setCachedPlaceDetails(placeId, details);
  return details;
}

export async function searchInterestPlaces(input: {
  destination: string;
  centerLat: number;
  centerLng: number;
  interests: string[];
  limit?: number;
}): Promise<PlaceHit[]> {
  if (!SERVER_KEY) return [];
  const queries = input.interests.slice(0, 6).map((i) => `${i} in ${input.destination}`);
  const hits: PlaceHit[] = [];
  for (const q of queries) {
    const hit = await textSearchPlace({
      query: q,
      centerLat: input.centerLat,
      centerLng: input.centerLng,
      radiusMeters: 25000,
    });
    if (hit && !hits.some((h) => h.placeId === hit.placeId)) hits.push(hit);
    if (hits.length >= (input.limit ?? 24)) break;
  }
  return hits;
}
