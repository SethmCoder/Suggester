import { searchCatalog, regionStatus, upsertHotels } from "@/lib/hotels/catalog-store";
import {
  enrichWithWikidata,
  nominatimAreaSearch,
  nominatimNameSearch,
  overpassAreaSearch,
  regionKey,
  resolveHotelCenter,
} from "@/lib/hotels/discover";
import { filterHotels, type HotelQuery, type HotelRecord } from "@/lib/hotels/record";

const FRESH_MS = 14 * 24 * 60 * 60 * 1000;
const inflight = new Map<string, Promise<HotelRecord[]>>();

async function importArea(lat: number, lng: number): Promise<HotelRecord[]> {
  const key = regionKey(lat, lng);
  const current = inflight.get(key);
  if (current) return current;
  const job = (async () => {
    let hotels: HotelRecord[] = [];
    let error: string | null = null;
    try {
      hotels = await overpassAreaSearch(lat, lng);
    } catch (err) {
      error = err instanceof Error ? err.message : "Overpass unavailable";
      hotels = await nominatimAreaSearch({ lat, lng });
      if (hotels.length) error = null;
    }
    for (const propertyType of ["hostel", "motel", "guest_house"] as const) {
      try {
        hotels = hotels.concat(await nominatimAreaSearch({ lat, lng, propertyType }));
      } catch {
        /* keep the hotels already collected */
      }
    }
    hotels = await enrichWithWikidata(hotels);
    await upsertHotels(hotels, { key, error: hotels.length ? null : error });
    return hotels;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export async function searchHotels(query: HotelQuery) {
  const center =
    query.city || (query.lat != null && query.lng != null)
      ? resolveHotelCenter(query.city ?? "", query.lat, query.lng)
      : null;
  const located: HotelQuery = {
    ...query,
    lat: query.lat ?? center?.lat,
    lng: query.lng ?? center?.lng,
    city: query.city || center?.label,
    radiusKm: query.radiusKm ?? (query.q ? 30 : 12),
  };

  if (located.q && located.q.trim().length >= 2 && located.city) {
    const already = filterHotels(
      (await searchCatalog({ ...located, limit: 40, offset: 0 })).hotels,
      located,
    );
    if (!already.length) {
      const named = await enrichWithWikidata(
        await nominatimNameSearch(located.city, located.q.trim()),
      );
      if (named.length) await upsertHotels(named);
    }
  } else if (located.lat != null && located.lng != null) {
    const key = regionKey(located.lat, located.lng);
    const status = regionStatus(key);
    const fresh =
      status?.status === "ok" &&
      status.fetched > 0 &&
      Date.now() - Date.parse(status.at) < FRESH_MS;
    if (!fresh) await importArea(located.lat, located.lng);
  }

  return searchCatalog(located);
}
