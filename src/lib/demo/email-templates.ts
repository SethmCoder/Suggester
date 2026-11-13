/**
 * Sample confirmation emails for demo paste try-outs.
 * Formats match parseBookingFromEmailText / dreamer paste expectations.
 */

export type DemoFlightTemplateFields = {
  fromIata: string;
  toIata: string;
  flightNumber: string;
  date: string;
  departureLocal: string;
  arrivalLocal: string;
  confirmation: string;
  cabin: string;
};

export type DemoHotelTemplateFields = {
  property: string;
  city: string;
  checkIn: string;
  checkOut: string;
  confirmation: string;
};

export const DEFAULT_DEMO_FLIGHT_FIELDS: DemoFlightTemplateFields = {
  fromIata: "SEA",
  toIata: "CDG",
  flightNumber: "AF039",
  date: "2026-06-01",
  departureLocal: "15:40",
  arrivalLocal: "11:10",
  confirmation: "P4R1S7",
  cabin: "economy",
};

export const DEFAULT_DEMO_HOTEL_FIELDS: DemoHotelTemplateFields = {
  property: "Hotel des Grands Boulevards",
  city: "Paris, France",
  checkIn: "2026-06-01",
  checkOut: "2026-06-04",
  confirmation: "HT88241",
};

/** Plain body only — avoid a leading "Subject:" line (parser can latch on it). */
export function buildDemoFlightEmail(fields: DemoFlightTemplateFields): string {
  const from = fields.fromIata.trim().toUpperCase().slice(0, 3) || "SEA";
  const to = fields.toIata.trim().toUpperCase().slice(0, 3) || "CDG";
  const flight =
    fields.flightNumber.trim().replace(/\s+/g, "").toUpperCase() || "AF039";
  const cabin = fields.cabin.trim() || "economy";
  const conf = fields.confirmation.trim().toUpperCase() || "P4R1S7";
  return `Flight number: ${flight}
Route: ${from} → ${to}
Travel date: ${fields.date.trim() || "2026-06-01"}
Confirmation code: ${conf}
Cabin: ${cabin}
Scheduled departure: ${fields.departureLocal.trim() || "15:40"}
Scheduled arrival: ${fields.arrivalLocal.trim() || "11:10"}

Passenger: Demo Traveler
Please arrive at the airport 2 hours before departure.
`;
}

export function buildDemoHotelEmail(fields: DemoHotelTemplateFields): string {
  const property =
    fields.property.trim() || "Hotel des Grands Boulevards";
  const conf = fields.confirmation.trim().toUpperCase() || "HT88241";
  return `Confirmation code: ${conf}
Check-in: ${fields.checkIn.trim() || "2026-06-01"}
Check-out: ${fields.checkOut.trim() || "2026-06-04"}
Property: ${property}
${fields.city.trim() || "Paris, France"}

Guest: Demo Traveler
Room: 1 Double
Breakfast: excluded
`;
}
