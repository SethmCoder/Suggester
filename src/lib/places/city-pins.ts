import { loadGeonameCities, resolveGeonameCity, type GeonameCity } from "@/lib/geonames/cities";
import { haversineKm } from "@/lib/trips/legs";

export type CityAreaPin = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  population: number;
  countryCode: string;
};

const AREA_CODES = new Set(["PPLX", "PPLA2", "PPLA3", "PPLA4"]);

/** The destination plus nearby GeoNames population centers in the same area. */
export function cityAreaPins(query: string, limit = 8): CityAreaPin[] {
  const anchor = resolveGeonameCity(query);
  if (!anchor || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lng)) return [];
  const radius = anchor.population >= 1_000_000 ? 15 : 30;
  const sameAdmin = collect(anchor, radius, true);
  const pool =
    sameAdmin.length >= 4
      ? sameAdmin
      : collect(anchor, Math.max(radius, 28), true).length >= 3
        ? collect(anchor, Math.max(radius, 28), true)
        : collect(anchor, Math.max(radius, 28), false);
  pool.sort((a, b) => score(b) - score(a));
  const picked: GeonameCity[] = [];
  const seen = new Set([norm(anchor.name)]);
  for (const row of pool) {
    const key = norm(row.city.name);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(row.city);
    if (picked.length >= limit - 1) break;
  }
  return [anchor, ...picked].map(toPin);
}

function collect(anchor: GeonameCity, radiusKm: number, sameAdmin: boolean) {
  const rows: { city: GeonameCity; km: number }[] = [];
  for (const city of loadGeonameCities()) {
    if (city.id === anchor.id || city.countryCode !== anchor.countryCode) continue;
    if (sameAdmin && city.admin1 !== anchor.admin1) continue;
    if (!AREA_CODES.has(city.featureCode)) continue;
    const km = haversineKm(anchor.lat, anchor.lng, city.lat, city.lng);
    if (km <= 0.4 || km > radiusKm) continue;
    rows.push({ city, km });
  }
  return rows;
}

function score(row: { city: GeonameCity; km: number }) {
  return row.city.population / (1 + row.km * 0.35);
}

function norm(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toPin(city: GeonameCity): CityAreaPin {
  return {
    id: city.id,
    name: city.name,
    lat: city.lat,
    lng: city.lng,
    population: city.population,
    countryCode: city.countryCode,
  };
}
