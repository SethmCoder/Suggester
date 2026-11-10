import { bookingHasConcreteEvidence } from "./ingest";
import type { ParsedBooking } from "./types";

export type DreamerBookingEvidenceRow = {
  kind: string;
  parsed?: ParsedBooking | null;
  title?: string | null;
};

/**
 * Collapse Dreamer bookings into trip-create fields.
 * Confirmation text wins over estimates — this is the invent-nothing spine.
 */
export function evidencePackFromBookings(bookings: DreamerBookingEvidenceRow[]): {
  ready: boolean;
  flight: ParsedBooking | null;
  hotel: ParsedBooking | null;
  flightNumber?: string;
  arrivalLocal?: string;
  departureLocal?: string;
  fromIata?: string;
  toIata?: string;
  hotelName?: string;
  startDate?: string;
  provenance: string[];
} {
  const flightRow = bookings.find((b) => b.kind === "flight");
  const hotelRow = bookings.find((b) => b.kind === "hotel");
  const flight = (flightRow?.parsed ?? null) as ParsedBooking | null;
  const hotel = (hotelRow?.parsed ?? null) as ParsedBooking | null;

  const ready = bookings.some((b) =>
    bookingHasConcreteEvidence((b.parsed ?? {}) as ParsedBooking),
  );

  const provenance: string[] = [];
  if (flight?.flightNumber) {
    provenance.push(`Flight ${flight.flightNumber}`);
  } else if (flight?.fromIata && flight?.toIata) {
    provenance.push(`${flight.fromIata} → ${flight.toIata}`);
  }
  if (flight?.arrivalLocal) provenance.push(`arrives ${flight.arrivalLocal}`);
  if (flight?.departureLocal) provenance.push(`departs ${flight.departureLocal}`);
  if (hotel?.hotelName) provenance.push(`stay ${hotel.hotelName}`);
  if (flight?.confirmation || hotel?.confirmation) {
    provenance.push("confirmation on file");
  }

  return {
    ready,
    flight,
    hotel,
    flightNumber: flight?.flightNumber ?? undefined,
    arrivalLocal: flight?.arrivalLocal ?? undefined,
    departureLocal: flight?.departureLocal ?? undefined,
    fromIata: flight?.fromIata ?? undefined,
    toIata: flight?.toIata ?? undefined,
    hotelName: hotel?.hotelName ?? undefined,
    startDate: flight?.startDate ?? hotel?.startDate ?? undefined,
    provenance,
  };
}
