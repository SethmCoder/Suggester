import type { MapsProviderId } from "./types";

export const MAPS_PROVIDER_KEY = "waypoint:mapsProvider";
export const DEFAULT_MAPS_PROVIDER: MapsProviderId = "openstreetmap";

export function getMapsProviderPreference(): MapsProviderId {
  if (typeof window === "undefined") {
    const env = process.env.MAPS_PROVIDER as MapsProviderId | undefined;
    if (env === "google" || env === "openstreetmap") return env;
    // Prefer OSM when Google keys are missing
    if (!process.env.GOOGLE_MAPS_SERVER_KEY) return "openstreetmap";
    return (process.env.MAPS_PROVIDER as MapsProviderId) || DEFAULT_MAPS_PROVIDER;
  }
  try {
    const v = localStorage.getItem(MAPS_PROVIDER_KEY);
    if (v === "google" || v === "openstreetmap") return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_MAPS_PROVIDER;
}

export function setMapsProviderPreference(provider: MapsProviderId) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MAPS_PROVIDER_KEY, provider);
  window.dispatchEvent(
    new CustomEvent("waypoint:maps-provider", { detail: provider }),
  );
}

export function resolveServerMapsProvider(
  cookieHeader?: string | null,
): MapsProviderId {
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)waypoint_maps=([^;]+)/);
    if (match?.[1] === "google" || match?.[1] === "openstreetmap") {
      return match[1];
    }
  }
  if (process.env.MAPS_PROVIDER === "google") return "google";
  if (process.env.MAPS_PROVIDER === "openstreetmap") return "openstreetmap";
  if (!process.env.GOOGLE_MAPS_SERVER_KEY) return "openstreetmap";
  return DEFAULT_MAPS_PROVIDER;
}
