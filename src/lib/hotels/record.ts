/** A hotel row discovered from OpenStreetMap. Missing fields stay null. */

export const HOTEL_TYPES = [
  "hotel",
  "motel",
  "hostel",
  "guest_house",
  "apartment",
  "chalet",
  "bed_and_breakfast",
] as const;

export type HotelPropertyType = (typeof HOTEL_TYPES)[number];

export type HotelRecord = {
  id: string;
  osmId: string;
  osmType: "node" | "way" | "relation";
  wikidataId: string | null;
  name: string;
  altNames: string[];
  propertyType: HotelPropertyType;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  postalCode: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  starRating: number | null;
  amenities: string[];
  checkIn: string | null;
  checkOut: string | null;
  chain: string | null;
  openedOn: string | null;
  lastVerifiedAt: string;
  source: "openstreetmap";
  sourceUpdatedAt: string | null;
};

export type HotelQuery = {
  q?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  south?: number;
  west?: number;
  north?: number;
  east?: number;
  propertyType?: string;
  minStars?: number;
  amenity?: string;
  limit?: number;
  offset?: number;
};

const AMENITY_TAGS: { tag: string; label: string }[] = [
  { tag: "internet_access", label: "Internet" },
  { tag: "wifi", label: "Wi-Fi" },
  { tag: "wheelchair", label: "Wheelchair access" },
  { tag: "air_conditioning", label: "Air conditioning" },
  { tag: "swimming_pool", label: "Pool" },
  { tag: "breakfast", label: "Breakfast" },
  { tag: "parking", label: "Parking" },
  { tag: "restaurant", label: "Restaurant" },
  { tag: "bar", label: "Bar" },
  { tag: "gym", label: "Gym" },
  { tag: "fitness_centre", label: "Gym" },
  { tag: "laundry", label: "Laundry" },
  { tag: "elevator", label: "Elevator" },
  { tag: "pets", label: "Pets allowed" },
];

export function isHotelType(value: string | null | undefined): value is HotelPropertyType {
  return HOTEL_TYPES.includes(value as HotelPropertyType);
}

export function hotelKey(osmType: string, osmId: string) {
  return `${osmType}:${osmId}`;
}

export function clampStars(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", ".").split(";")[0]);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

function yes(value: string | undefined) {
  if (!value) return false;
  const v = value.toLowerCase();
  return v === "yes" || v === "wifi" || v === "wlan" || v === "designated" || v === "customers";
}

export function amenitiesFromTags(tags: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  for (const item of AMENITY_TAGS) {
    const value = tags[item.tag];
    if (!value || value === "no") continue;
    if (item.tag === "internet_access" || item.tag === "wifi") {
      if (yes(value) || value === "wlan" || value === "wired") out.push(item.label);
      continue;
    }
    if (yes(value) || (item.tag === "parking" && value !== "no")) {
      if (item.tag === "parking" && !yes(value) && value !== "yes") {
        if (value === "no") continue;
      }
      out.push(item.label);
    }
  }
  return [...new Set(out)];
}

export function formatAddress(parts: {
  house?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
}): string | null {
  const line = [parts.house, parts.street].filter(Boolean).join(" ");
  const tail = [parts.city, parts.region, parts.postcode, parts.country].filter(Boolean);
  const all = [line, ...tail].filter(Boolean);
  return all.length ? all.join(", ") : null;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Keep the richer record when the same OSM object appears twice. */
export function dedupeHotels(hotels: HotelRecord[]): HotelRecord[] {
  const byId = new Map<string, HotelRecord>();
  for (const hotel of hotels) {
    const prev = byId.get(hotel.id);
    if (!prev || scoreRecord(hotel) >= scoreRecord(prev)) byId.set(hotel.id, hotel);
  }
  const list = [...byId.values()];
  const dropped = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    if (dropped.has(list[i].id)) continue;
    for (let j = i + 1; j < list.length; j++) {
      if (dropped.has(list[j].id)) continue;
      const sameName = list[i].name.toLowerCase() === list[j].name.toLowerCase();
      const near =
        haversineKm(
          list[i].latitude,
          list[i].longitude,
          list[j].latitude,
          list[j].longitude,
        ) < 0.04;
      if (sameName && near) {
        const loser = scoreRecord(list[i]) >= scoreRecord(list[j]) ? list[j] : list[i];
        dropped.add(loser.id);
      }
    }
  }
  return list.filter((hotel) => !dropped.has(hotel.id));
}

function scoreRecord(hotel: HotelRecord) {
  return (
    (hotel.website ? 4 : 0) +
    (hotel.phone ? 2 : 0) +
    (hotel.address ? 2 : 0) +
    (hotel.starRating != null ? 1 : 0) +
    hotel.amenities.length +
    (hotel.wikidataId ? 1 : 0)
  );
}

export function filterHotels(hotels: HotelRecord[], query: HotelQuery): HotelRecord[] {
  const q = query.q?.trim().toLowerCase() ?? "";
  const city = query.city?.trim().toLowerCase() ?? "";
  const country = query.country?.trim().toLowerCase() ?? "";
  const type = query.propertyType?.trim().toLowerCase() ?? "";
  const amenity = query.amenity?.trim().toLowerCase() ?? "";
  const radius = query.radiusKm ?? (query.lat != null ? 12 : null);
  const minStars = query.minStars ?? 0;

  const matched = hotels.filter((hotel) => {
    const names = [hotel.name, ...(hotel.altNames ?? [])].join(" ").toLowerCase();
    if (q && !names.includes(q)) return false;
    if (type && hotel.propertyType !== type) return false;
    if (minStars > 0 && (hotel.starRating == null || hotel.starRating < minStars)) {
      return false;
    }
    if (
      amenity &&
      !hotel.amenities.some((item) => item.toLowerCase().includes(amenity))
    ) {
      return false;
    }
    if (country) {
      const code = hotel.countryCode?.toLowerCase() ?? "";
      const name = hotel.country?.toLowerCase() ?? "";
      if (code !== country && !name.includes(country)) return false;
    }
    if (
      query.south != null &&
      query.north != null &&
      query.west != null &&
      query.east != null
    ) {
      if (hotel.latitude < query.south || hotel.latitude > query.north) return false;
      if (hotel.longitude < query.west || hotel.longitude > query.east) return false;
    } else if (query.lat != null && query.lng != null && radius != null) {
      const km = haversineKm(query.lat, query.lng, hotel.latitude, hotel.longitude);
      if (km > radius) return false;
    } else if (city) {
      const inCity = (hotel.city ?? "").toLowerCase().includes(city);
      const inAddress = (hotel.address ?? "").toLowerCase().includes(city);
      if (!inCity && !inAddress) return false;
    }
    return true;
  });

  matched.sort((a, b) => {
    const aStarts = q && a.name.toLowerCase().startsWith(q) ? 1 : 0;
    const bStarts = q && b.name.toLowerCase().startsWith(q) ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;
    const aStars = a.starRating ?? 0;
    const bStars = b.starRating ?? 0;
    if (aStars !== bStars) return bStars - aStars;
    if (query.lat != null && query.lng != null) {
      return (
        haversineKm(query.lat, query.lng, a.latitude, a.longitude) -
        haversineKm(query.lat, query.lng, b.latitude, b.longitude)
      );
    }
    return a.name.localeCompare(b.name);
  });

  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(40, Math.max(1, query.limit ?? 12));
  return matched.slice(offset, offset + limit);
}

export function toPublicHotel(hotel: HotelRecord) {
  return {
    ...hotel,
    attribution: "© OpenStreetMap contributors",
    license: "ODbL",
    wikidataLicense: hotel.wikidataId ? "CC0" : null,
  };
}
