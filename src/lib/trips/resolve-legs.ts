import { resolveGeonameCity } from "@/lib/geonames/cities";
import { textSearchPlace, geocodeDestination } from "@/lib/maps";
import type { TripLeg } from "@/lib/types/trip";

/** Resolve GeoNames coords + optional hotel pin for each leg. */
export async function resolveTripLegs(
  legs: TripLeg[],
): Promise<TripLeg[]> {
  const out: TripLeg[] = [];
  for (const leg of legs) {
    const cityName = leg.city.trim();
    if (!cityName) continue;
    let lat = leg.lat;
    let lng = leg.lng;
    let geonameId = leg.geonameId;
    let countryCode = leg.countryCode;

    if (lat == null || lng == null) {
      const gn = resolveGeonameCity(cityName);
      if (gn) {
        lat = gn.lat;
        lng = gn.lng;
        geonameId = gn.id;
        countryCode = gn.countryCode;
      } else {
        const geo = await geocodeDestination(cityName);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
        }
      }
    }

    let hotelLat = leg.hotelLat;
    let hotelLng = leg.hotelLng;
    let hotelPlaceId = leg.hotelPlaceId;
    let hotelAddress = leg.hotelAddress;
    const hotel = leg.hotel?.trim();
    if (hotel && lat != null && lng != null) {
      const hit = await textSearchPlace({
        query: `${hotel} ${cityName}`,
        centerLat: lat,
        centerLng: lng,
        radiusMeters: 25000,
      });
      if (hit) {
        hotelLat = hit.lat;
        hotelLng = hit.lng;
        hotelPlaceId = hit.placeId;
        hotelAddress = hit.formattedAddress;
      }
    }

    out.push({
      ...leg,
      city: cityName,
      days: Math.max(1, Math.floor(Number(leg.days)) || 1),
      hotel: hotel || undefined,
      lat,
      lng,
      geonameId,
      countryCode,
      hotelLat,
      hotelLng,
      hotelPlaceId,
      hotelAddress,
    });
  }
  return out;
}

export function primaryDestinationLabel(legs: TripLeg[]): string {
  if (!legs.length) return "Trip";
  const cities = [...new Set(legs.map((l) => l.city))];
  return cities.length === 1 ? cities[0] : cities.join(" → ");
}
