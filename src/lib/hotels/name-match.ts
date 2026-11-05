import {
  cityMatchesLocation,
  dedupeHotels,
  locationStartsWithCity,
  type HotelRecord,
  type HotelSuggestion,
} from "@/lib/hotels/hotelrec";

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Higher scores are closer name matches. 0 means the query does not match. */
export function hotelNameMatchScore(query: string, name: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q || !n) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 860 - Math.min(n.length, 80);
  const words = n.split(" ").filter(Boolean);
  if (words.some((word) => word.startsWith(q))) return 720;
  if (q.includes(" ") && q.split(" ").every((token) => n.includes(token))) {
    return 640;
  }
  if (n.includes(q)) return 480 - Math.min(n.indexOf(q), 40);
  return 0;
}

export function searchHotelsByName(
  hotels: HotelRecord[],
  input: { city: string; query: string; limit?: number },
): HotelSuggestion[] {
  const limit = input.limit ?? 8;
  const query = input.query.trim();
  if (query.length < 1) return [];
  return dedupeHotels(hotels)
    .filter((hotel) => cityMatchesLocation(hotel.location, input.city))
    .map((hotel) => ({
      hotel,
      score: hotelNameMatchScore(query, hotel.name),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aCity = locationStartsWithCity(a.hotel.location, input.city) ? 1 : 0;
      const bCity = locationStartsWithCity(b.hotel.location, input.city) ? 1 : 0;
      if (aCity !== bCity) return bCity - aCity;
      return b.hotel.rating - a.hotel.rating || b.hotel.n - a.hotel.n;
    })
    .slice(0, limit)
    .map(({ hotel }) => ({
      id: hotel.id,
      name: hotel.name,
      location: hotel.location,
      rating: hotel.rating,
      reviewCount: hotel.n,
      locationScore: hotel.locationScore,
      quotes: hotel.quotes.slice(0, 1),
    }));
}
