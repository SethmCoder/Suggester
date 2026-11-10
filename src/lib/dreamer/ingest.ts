import { pickBestMatch, type MatchCandidate } from "./match-booking";
import { inheritBookingContext, parseBookingFromEmailText } from "./parse-email";
import { summarizeParsedBooking } from "./summary";
import type { DreamerBookingSource, ParsedBooking } from "./types";

export type IngestParseResult = {
  parsed: ParsedBooking;
  title: string;
  summary: string;
};

export function parseAndSummarize(input: {
  subject?: string | null;
  text?: string | null;
  primaryContext?: ParsedBooking | null;
}): IngestParseResult {
  let parsed = parseBookingFromEmailText({
    subject: input.subject,
    text: input.text,
  });
  if (input.primaryContext) {
    parsed = inheritBookingContext(parsed, input.primaryContext);
  }
  const title =
    parsed.kind === "flight" && parsed.fromIata && parsed.toIata
      ? `${parsed.fromIata} → ${parsed.toIata}`
      : parsed.hotelName || input.subject || "Confirmation";
  return {
    parsed,
    title,
    summary: summarizeParsedBooking(parsed),
  };
}

export function resolveMatch(input: {
  parsed: ParsedBooking;
  candidates: MatchCandidate[];
  preferredFutureTripId?: string | null;
}) {
  return pickBestMatch(input.parsed, input.candidates, 3, {
    preferredId: input.preferredFutureTripId,
    preferredSlack: 2.5,
  });
}

export function bookingHasConcreteEvidence(parsed: ParsedBooking): boolean {
  return Boolean(
    parsed.startDate &&
      (parsed.kind === "flight" ||
        parsed.kind === "hotel" ||
        parsed.kind === "rail" ||
        parsed.confirmation),
  );
}

export function mapBookingRow(row: {
  id: string;
  owner_id: string;
  future_trip_id?: string | null;
  trip_id?: string | null;
  inbound_email_id?: string | null;
  kind: string;
  title: string;
  parsed?: ParsedBooking | null;
  starts_at?: string | null;
  ends_at?: string | null;
  match_score?: number | null;
  source: string;
  created_at: string;
  updated_at: string;
}) {
  const parsed = (row.parsed ?? {}) as ParsedBooking;
  return {
    id: row.id,
    ownerId: row.owner_id,
    futureTripId: row.future_trip_id,
    tripId: row.trip_id,
    inboundEmailId: row.inbound_email_id,
    kind: row.kind as "flight" | "hotel" | "rail" | "other",
    title: row.title,
    summary: summarizeParsedBooking(parsed),
    parsed,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    matchScore: row.match_score,
    source: row.source as DreamerBookingSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
