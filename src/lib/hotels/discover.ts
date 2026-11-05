import {
  accountlessFetch,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";
import { resolveGeonameCity } from "@/lib/geonames/cities";
import {
  amenitiesFromTags,
  clampStars,
  dedupeHotels,
  formatAddress,
  hotelKey,
  isHotelType,
  type HotelPropertyType,
  type HotelRecord,
} from "@/lib/hotels/record";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const TOURISM = "hotel|motel|hostel|guest_house|apartment|chalet|bed_and_breakfast";

type NominatimRow = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  name?: string;
  namedetails?: { name?: string; "name:en"?: string };
  extratags?: Record<string, string>;
  address?: Record<string, string>;
};

let nextNominatimAt = 0;

async function nominatim(url: string): Promise<NominatimRow[]> {
  const wait = nextNominatimAt - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  nextNominatimAt = Date.now() + 1100;
  const res = await accountlessFetch(url, {
    headers: { "User-Agent": waypointUserAgent(), Accept: "application/json" },
    timeoutMs: 12000,
    retryOnce: false,
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as NominatimRow[];
  return Array.isArray(rows) ? rows : [];
}

function websiteOf(raw: string | undefined) {
  if (!raw) return null;
  const url = raw.split(";")[0]?.trim() ?? "";
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.includes(".")) return `https://${url}`;
  return null;
}

export function recordFromTags(input: {
  osmType: string;
  osmId: string;
  lat: number;
  lng: number;
  tags: Record<string, string | undefined>;
  address?: Record<string, string | undefined>;
}): HotelRecord | null {
  const propertyType = input.tags.tourism;
  if (!isHotelType(propertyType)) return null;
  const localName = input.tags.name?.trim();
  const englishName = input.tags["name:en"]?.trim();
  const name = englishName || localName;
  if (!name || /^(hotel|hôtel|hotels|hostel|motel)$/i.test(name)) return null;
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return null;
  const addr = input.address ?? {};
  const city = addr.city || addr.town || addr.village || addr.municipality || input.tags["addr:city"] || null;
  const region = addr.state || input.tags["addr:state"] || null;
  const country = addr.country || input.tags["addr:country"] || null;
  const countryCode = (addr.country_code || input.tags["addr:country"] || "")
    .toString()
    .slice(0, 2)
    .toUpperCase() || null;
  const now = new Date().toISOString();
  return {
    id: hotelKey(input.osmType, input.osmId),
    osmId: input.osmId,
    osmType: input.osmType === "way" || input.osmType === "relation" ? input.osmType : "node",
    wikidataId: /^Q\d+$/.test(input.tags.wikidata ?? "") ? input.tags.wikidata! : null,
    name,
    altNames: localName && localName !== name ? [localName] : [],
    propertyType,
    latitude: input.lat,
    longitude: input.lng,
    address: formatAddress({
      house: input.tags["addr:housenumber"] || addr.house_number,
      street: input.tags["addr:street"] || addr.road,
      city,
      region,
      postcode: input.tags["addr:postcode"] || addr.postcode,
      country,
    }),
    city,
    region,
    country,
    countryCode: countryCode && countryCode.length === 2 ? countryCode : null,
    postalCode: input.tags["addr:postcode"] || addr.postcode || null,
    website: websiteOf(input.tags.website || input.tags["contact:website"] || input.tags.url),
    phone: input.tags.phone || input.tags["contact:phone"] || null,
    email: input.tags.email || input.tags["contact:email"] || null,
    starRating: clampStars(input.tags.stars),
    amenities: amenitiesFromTags(input.tags),
    checkIn: input.tags.check_in || input.tags["opening_hours:checkin"] || null,
    checkOut: input.tags.check_out || input.tags["opening_hours:checkout"] || null,
    chain: null,
    openedOn: null,
    lastVerifiedAt: now,
    source: "openstreetmap",
    sourceUpdatedAt: null,
  };
}

function fromNominatim(row: NominatimRow): HotelRecord | null {
  const osmType = row.osm_type === "way" || row.osm_type === "relation" ? row.osm_type : "node";
  if (!row.osm_id || row.category !== "tourism") return null;
  const tags: Record<string, string | undefined> = {
    ...(row.extratags ?? {}),
    name: row.namedetails?.name || row.name,
    "name:en": row.namedetails?.["name:en"],
    tourism: row.type,
  };
  return recordFromTags({
    osmType,
    osmId: String(row.osm_id),
    lat: Number(row.lat),
    lng: Number(row.lon),
    tags,
    address: row.address,
  });
}

export async function nominatimNameSearch(city: string, q: string): Promise<HotelRecord[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: `${q} ${city}`.trim(),
    namedetails: "1",
    addressdetails: "1",
    extratags: "1",
    limit: "8",
  });
  const rows = await nominatim(`https://nominatim.openstreetmap.org/search?${params}`);
  return dedupeHotels(rows.map(fromNominatim).filter((row): row is HotelRecord => Boolean(row)));
}

export async function nominatimAreaSearch(input: {
  lat: number;
  lng: number;
  propertyType?: HotelPropertyType;
}): Promise<HotelRecord[]> {
  const pad = 0.08;
  const south = input.lat - pad;
  const north = input.lat + pad;
  const west = input.lng - pad;
  const east = input.lng + pad;
  const q = input.propertyType?.replaceAll("_", " ") ?? "hotel";
  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    namedetails: "1",
    addressdetails: "1",
    extratags: "1",
    limit: "40",
    bounded: "1",
    viewbox: `${west},${north},${east},${south}`,
  });
  const rows = await nominatim(`https://nominatim.openstreetmap.org/search?${params}`);
  return dedupeHotels(rows.map(fromNominatim).filter((row): row is HotelRecord => Boolean(row)));
}

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

export async function overpassAreaSearch(
  lat: number,
  lng: number,
  options?: { timeoutMs?: number },
): Promise<HotelRecord[]> {
  const pad = 0.08;
  const south = (lat - pad).toFixed(4);
  const north = (lat + pad).toFixed(4);
  const west = (lng - pad).toFixed(4);
  const east = (lng + pad).toFixed(4);
  const query = `[out:json][timeout:8];(node["tourism"~"^(${TOURISM})$"](${south},${west},${north},${east});way["tourism"~"^(${TOURISM})$"](${south},${west},${north},${east}););out tags center;`;
  let lastError = "Overpass unavailable";
  for (const url of OVERPASS_MIRRORS.slice(0, 1)) {
    try {
      const res = await accountlessFetch(url, {
        method: "POST",
        headers: {
          "User-Agent": waypointUserAgent(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
        timeoutMs: options?.timeoutMs ?? 8000,
        retryOnce: false,
      });
      if (!res.ok) {
        lastError = `Overpass ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { elements?: OverpassElement[] };
      const hotels = (data.elements ?? [])
        .map((element) => {
          const latN = element.lat ?? element.center?.lat;
          const lngN = element.lon ?? element.center?.lon;
          if (latN == null || lngN == null || element.id == null || !element.type) return null;
          return recordFromTags({
            osmType: element.type,
            osmId: String(element.id),
            lat: latN,
            lng: lngN,
            tags: element.tags ?? {},
          });
        })
        .filter((row): row is HotelRecord => Boolean(row));
      return dedupeHotels(hotels);
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Overpass failed";
    }
  }
  throw new Error(lastError);
}

type WikidataEntity = {
  labels?: { en?: { value?: string } };
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
};

function claimString(entity: WikidataEntity, prop: string): string | null {
  const value = entity.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "time" in value) {
    const time = String((value as { time?: string }).time ?? "");
    return time.replace(/^\+/, "").slice(0, 10) || null;
  }
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: string }).id ?? "") || null;
  }
  return null;
}

function claimCoord(entity: WikidataEntity): { lat: number; lng: number } | null {
  const value = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  if (!value || typeof value !== "object") return null;
  const lat = Number((value as { latitude?: number }).latitude);
  const lng = Number((value as { longitude?: number }).longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Enrich only records that already carry a Wikidata id from OpenStreetMap. */
export async function enrichWithWikidata(hotels: HotelRecord[]): Promise<HotelRecord[]> {
  const ids = [
    ...new Set(
      hotels
        .map((hotel) => hotel.wikidataId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, 25);
  if (!ids.length) return hotels;
  const url =
    "https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels|claims&languages=en&format=json&ids=" +
    ids.join("|");
  try {
    const res = await accountlessFetch(url, {
      headers: { "User-Agent": waypointUserAgent(), Accept: "application/json" },
      timeoutMs: 12000,
      retryOnce: false,
    });
    if (!res.ok) return hotels;
    const data = (await res.json()) as { entities?: Record<string, WikidataEntity> };
    const entities = data.entities ?? {};
    const ownerIds = [
      ...new Set(
        ids
          .map((id) => (entities[id] ? claimString(entities[id], "P127") : null))
          .filter((id): id is string => Boolean(id?.startsWith("Q"))),
      ),
    ].slice(0, 15);
    const ownerNames = new Map<string, string>();
    if (ownerIds.length) {
      const ownerRes = await accountlessFetch(
        "https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=en&format=json&ids=" +
          ownerIds.join("|"),
        {
          headers: { "User-Agent": waypointUserAgent(), Accept: "application/json" },
          timeoutMs: 12000,
          retryOnce: false,
        },
      );
      if (ownerRes.ok) {
        const owners = (await ownerRes.json()) as {
          entities?: Record<string, WikidataEntity>;
        };
        for (const [id, entity] of Object.entries(owners.entities ?? {})) {
          const label = entity.labels?.en?.value;
          if (label) ownerNames.set(id, label);
        }
      }
    }
    return hotels.map((hotel) => {
      if (!hotel.wikidataId) return hotel;
      const entity = entities[hotel.wikidataId];
      if (!entity || entity.labels == null && entity.claims == null) return hotel;
      const coord = claimCoord(entity);
      if (coord) {
        const km = Math.hypot(
          (coord.lat - hotel.latitude) * 111,
          (coord.lng - hotel.longitude) * 111 * Math.cos((hotel.latitude * Math.PI) / 180),
        );
        if (km > 2) return hotel;
      }
      const website = websiteOf(claimString(entity, "P856") ?? undefined);
      const opened = claimString(entity, "P571");
      const ownerId = claimString(entity, "P127");
      const chain = ownerId ? ownerNames.get(ownerId) ?? null : null;
      return {
        ...hotel,
        website: hotel.website || website,
        openedOn: opened,
        chain,
      };
    });
  } catch {
    return hotels;
  }
}

export function regionKey(lat: number, lng: number) {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export function resolveHotelCenter(city: string, lat?: number, lng?: number) {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, label: city };
  }
  const found = resolveGeonameCity(city);
  if (!found) return null;
  return { lat: found.lat, lng: found.lng, label: found.name };
}
