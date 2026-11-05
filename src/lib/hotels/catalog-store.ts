import fs from "fs";
import path from "path";
import { createServiceClient } from "@/lib/supabase/server";
import {
  dedupeHotels,
  filterHotels,
  type HotelQuery,
  type HotelRecord,
} from "@/lib/hotels/record";

type CatalogFile = {
  hotels: Record<string, HotelRecord>;
  regions: Record<
    string,
    { at: string; status: "ok" | "failed"; fetched: number; error: string | null }
  >;
};

const EMPTY: CatalogFile = { hotels: {}, regions: {} };

function catalogPath() {
  return path.join(process.cwd(), "data", "hotels", "catalog.json");
}

let memory: CatalogFile | null = null;
let writing: Promise<void> = Promise.resolve();

function readFile(): CatalogFile {
  if (memory) return memory;
  try {
    const raw = fs.readFileSync(catalogPath(), "utf8");
    const parsed = JSON.parse(raw) as CatalogFile;
    memory = {
      hotels: parsed.hotels ?? {},
      regions: parsed.regions ?? {},
    };
  } catch {
    memory = { hotels: {}, regions: {} };
  }
  return memory;
}

function writeFile(next: CatalogFile) {
  memory = next;
  writing = writing.then(() => {
    const file = catalogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next));
  });
  return writing;
}

export function listStoredHotels(): HotelRecord[] {
  return Object.values(readFile().hotels);
}

export function regionStatus(key: string) {
  return readFile().regions[key] ?? null;
}

export async function upsertHotels(hotels: HotelRecord[], region?: { key: string; error?: string | null }) {
  const current = readFile();
  const hotelsNext = { ...current.hotels };
  for (const hotel of dedupeHotels(hotels)) hotelsNext[hotel.id] = hotel;
  const regions = { ...current.regions };
  if (region) {
    regions[region.key] = {
      at: new Date().toISOString(),
      status: region.error ? "failed" : "ok",
      fetched: hotels.length,
      error: region.error ?? null,
    };
  }
  await writeFile({ hotels: hotelsNext, regions });
  await upsertSupabase(hotels, region);
}

async function upsertSupabase(
  hotels: HotelRecord[],
  region?: { key: string; error?: string | null },
) {
  const supabase = createServiceClient();
  if (!supabase || !hotels.length) {
    if (supabase && region) {
      await supabase.from("hotel_import_runs").insert({
        region_key: region.key,
        status: region.error ? "failed" : "ok",
        fetched: hotels.length,
        upserted: 0,
        error: region.error ?? null,
        finished_at: new Date().toISOString(),
      });
    }
    return;
  }
  const rows = hotels.map((hotel) => ({
    osm_id: hotel.osmId,
    osm_type: hotel.osmType,
    wikidata_id: hotel.wikidataId,
    name: hotel.name,
    property_type: hotel.propertyType,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    address: hotel.address,
    city: hotel.city,
    region: hotel.region,
    country: hotel.country,
    country_code: hotel.countryCode,
    postal_code: hotel.postalCode,
    website: hotel.website,
    phone: hotel.phone,
    email: hotel.email,
    star_rating: hotel.starRating,
    amenities: hotel.amenities,
    check_in: hotel.checkIn,
    check_out: hotel.checkOut,
    chain: hotel.chain,
    opened_on: hotel.openedOn,
    last_verified_at: hotel.lastVerifiedAt,
    source: hotel.source,
    source_updated_at: hotel.sourceUpdatedAt,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("hotels").upsert(rows, { onConflict: "osm_type,osm_id" });
  await supabase.from("hotel_import_runs").insert({
    region_key: region?.key ?? "ad-hoc",
    status: error ? "failed" : "ok",
    fetched: hotels.length,
    upserted: error ? 0 : hotels.length,
    error: error?.message ?? region?.error ?? null,
    finished_at: new Date().toISOString(),
  });
}

export async function searchCatalog(query: HotelQuery): Promise<{
  hotels: HotelRecord[];
  total: number;
}> {
  const local = filterHotels(listStoredHotels(), { ...query, limit: 500, offset: 0 });
  const remote = await searchSupabase(query);
  const merged = dedupeHotels([...remote, ...local]);
  const page = filterHotels(merged, query);
  const total = filterHotels(merged, { ...query, limit: 500, offset: 0 }).length;
  return { hotels: page, total };
}

async function searchSupabase(query: HotelQuery): Promise<HotelRecord[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];
  let request = supabase.from("hotels").select("*").limit(80);
  if (query.q) request = request.ilike("name", `%${query.q}%`);
  if (query.city) request = request.ilike("city", `%${query.city}%`);
  if (query.country) request = request.ilike("country_code", query.country.toUpperCase());
  if (query.propertyType) request = request.eq("property_type", query.propertyType);
  if (query.south != null) request = request.gte("latitude", query.south);
  if (query.north != null) request = request.lte("latitude", query.north);
  if (query.west != null) request = request.gte("longitude", query.west);
  if (query.east != null) request = request.lte("longitude", query.east);
  const { data, error } = await request;
  if (error || !data) return [];
  return data.map(rowFromSupabase);
}

function rowFromSupabase(row: Record<string, unknown>): HotelRecord {
  return {
    id: `${row.osm_type}:${row.osm_id}`,
    osmId: String(row.osm_id),
    osmType: row.osm_type === "way" || row.osm_type === "relation" ? row.osm_type : "node",
    wikidataId: (row.wikidata_id as string) ?? null,
    name: String(row.name),
    altNames: [],
    propertyType: row.property_type as HotelRecord["propertyType"],
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: (row.address as string) ?? null,
    city: (row.city as string) ?? null,
    region: (row.region as string) ?? null,
    country: (row.country as string) ?? null,
    countryCode: (row.country_code as string) ?? null,
    postalCode: (row.postal_code as string) ?? null,
    website: (row.website as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    starRating: row.star_rating == null ? null : Number(row.star_rating),
    amenities: Array.isArray(row.amenities) ? (row.amenities as string[]) : [],
    checkIn: (row.check_in as string) ?? null,
    checkOut: (row.check_out as string) ?? null,
    chain: (row.chain as string) ?? null,
    openedOn: (row.opened_on as string) ?? null,
    lastVerifiedAt: String(row.last_verified_at ?? new Date().toISOString()),
    source: "openstreetmap",
    sourceUpdatedAt: (row.source_updated_at as string) ?? null,
  };
}

export function resetCatalogMemoryForTests() {
  memory = EMPTY;
}
