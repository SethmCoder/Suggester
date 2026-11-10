import type { ParsedBooking } from "./types";

/** Fact-only one-line summary — never invents missing fields. */
export function summarizeParsedBooking(parsed: ParsedBooking): string {
  const parts: string[] = [];
  if (parsed.kind === "flight" && parsed.fromIata && parsed.toIata) {
    parts.push(`${parsed.fromIata} → ${parsed.toIata}`);
  } else if (parsed.kind === "hotel" && parsed.hotelName) {
    parts.push(parsed.hotelName);
  } else if (parsed.kind) {
    parts.push(parsed.kind);
  }
  if (parsed.startDate) parts.push(parsed.startDate);
  if (parsed.endDate && parsed.endDate !== parsed.startDate) {
    parts.push(`to ${parsed.endDate}`);
  }
  if (parsed.cabin) parts.push(parsed.cabin);
  if (parsed.confirmation) parts.push(`conf ${parsed.confirmation}`);
  if (parsed.cities?.length) parts.push(parsed.cities[0]!);
  return parts.join(" · ") || "Booking confirmation";
}
