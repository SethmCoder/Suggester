import { bookingHasConcreteEvidence } from "./ingest";
import type { ParsedBooking } from "./types";

export type DreamerBookingEvidenceRow = {
  kind: string;
  parsed?: ParsedBooking | null;
  title?: string | null;
};

export type BookedRestaurantEvidence = {
  name: string;
  date?: string | null;
  time?: string | null;
  city?: string | null;
};

/**
 * Collapse Dreamer bookings into trip-create fields.
 * Confirmation text wins over estimates — this is the invent-nothing spine.
 */
export function evidencePackFromBookings(bookings: DreamerBookingEvidenceRow[]): {
  ready: boolean;
  flight: ParsedBooking | null;
  hotel: ParsedBooking | null;
  restaurants: BookedRestaurantEvidence[];
  flightNumber?: string;
  arrivalLocal?: string;
  departureLocal?: string;
  fromIata?: string;
  toIata?: string;
  hotelName?: string;
  startDate?: string;
  provenance: string[];
} {
  const flightRow =
    bookings.find((b) => b.kind === "flight") ||
    bookings.find(
      (b) => b.parsed?.fromIata && b.parsed?.toIata,
    );
  const hotelRow =
    bookings.find((b) => b.kind === "hotel") ||
    bookings.find((b) => Boolean(b.parsed?.hotelName));
  const flight = (flightRow?.parsed ?? null) as ParsedBooking | null;
  const hotel = (hotelRow?.parsed ?? null) as ParsedBooking | null;

  const restaurants: BookedRestaurantEvidence[] = [];
  for (const row of bookings) {
    const parsed = row.parsed ?? {};
    const name =
      parsed.restaurantName?.trim() ||
      (row.kind === "restaurant" ? row.title?.trim() : null);
    if (!name) continue;
    restaurants.push({
      name,
      date: parsed.startDate ?? null,
      time: parsed.reservationLocal ?? null,
      city: parsed.cities?.[0] ?? null,
    });
  }

  const ready = bookings.some((b) =>
    bookingHasConcreteEvidence((b.parsed ?? {}) as ParsedBooking),
  );

  const hotelName =
    hotel?.hotelName?.trim() ||
    (hotelRow?.title && hotelRow.kind === "hotel"
      ? hotelRow.title.trim()
      : undefined) ||
    undefined;

  const provenance: string[] = [];
  if (flight?.flightNumber) {
    provenance.push(`Flight ${flight.flightNumber}`);
  } else if (flight?.fromIata && flight?.toIata) {
    provenance.push(`${flight.fromIata} → ${flight.toIata}`);
  }
  if (flight?.arrivalLocal) provenance.push(`arrives ${flight.arrivalLocal}`);
  if (flight?.departureLocal) provenance.push(`departs ${flight.departureLocal}`);
  if (hotelName) provenance.push(`stay ${hotelName}`);
  for (const meal of restaurants.slice(0, 3)) {
    provenance.push(`table ${meal.name}`);
  }
  if (flight?.confirmation || hotel?.confirmation) {
    provenance.push("confirmation on file");
  }

  return {
    ready,
    flight,
    hotel,
    restaurants,
    flightNumber: flight?.flightNumber ?? undefined,
    arrivalLocal: flight?.arrivalLocal ?? undefined,
    departureLocal: flight?.departureLocal ?? undefined,
    fromIata: flight?.fromIata ?? undefined,
    toIata: flight?.toIata ?? undefined,
    hotelName,
    startDate: flight?.startDate ?? hotel?.startDate ?? undefined,
    provenance,
  };
}
