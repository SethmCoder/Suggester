import * as googlePlaces from "../google/places";
import * as googleRoutes from "../google/routes";
import * as osm from "./openstreetmap";
import { resolveServerMapsProvider } from "./settings";
import type { DayRouteResult, MapsProviderId, PlaceDetails, PlaceHit } from "./types";

export type { PlaceDetails, PlaceHit, DayRouteResult, MapsProviderId };

function provider(cookieHeader?: string | null): MapsProviderId {
  const preferred = resolveServerMapsProvider(cookieHeader);
  if (preferred === "google" && process.env.GOOGLE_MAPS_SERVER_KEY) {
    return "google";
  }
  return "openstreetmap";
}

export async function geocodeDestination(
  query: string,
  cookieHeader?: string | null,
) {
  if (provider(cookieHeader) === "google") {
    const g = await googlePlaces.geocodeDestination(query);
    if (g) return g;
  }
  return osm.osmGeocode(query);
}

export async function textSearchPlace(
  input: {
    query: string;
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
  },
  cookieHeader?: string | null,
): Promise<PlaceHit | null> {
  if (provider(cookieHeader) === "google") {
    const g = await googlePlaces.textSearchPlace(input);
    if (g) return g;
  }
  return osm.osmTextSearch(input);
}

export async function getPlaceDetails(
  placeId: string,
  cookieHeader?: string | null,
): Promise<PlaceDetails | null> {
  if (placeId.startsWith("osm:")) {
    return osm.osmPlaceDetails(placeId);
  }
  if (provider(cookieHeader) === "google") {
    return googlePlaces.getPlaceDetails(placeId);
  }
  // Google place ids without Google key — cannot resolve
  return osm.osmPlaceDetails(placeId);
}

export async function searchInterestPlaces(
  input: {
    destination: string;
    centerLat: number;
    centerLng: number;
    interests: string[];
    limit?: number;
  },
  cookieHeader?: string | null,
): Promise<PlaceHit[]> {
  if (provider(cookieHeader) === "google") {
    const g = await googlePlaces.searchInterestPlaces(input);
    if (g.length) return g;
  }
  return osm.osmSearchInterestPlaces(input);
}

export async function computeDayRoute(
  input: {
    mode: "WALK" | "DRIVE" | "TRANSIT";
    points: { lat: number; lng: number }[];
  },
  cookieHeader?: string | null,
): Promise<DayRouteResult | null> {
  if (provider(cookieHeader) === "google") {
    const g = await googleRoutes.computeDayRoute(input);
    if (g) return g;
  }
  return osm.osmComputeDayRoute(input);
}
