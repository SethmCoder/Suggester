export type DreamerBookingKind = "flight" | "hotel" | "rail" | "other";
export type DreamerBookingSource = "email_forward" | "manual" | "paste";
export type InboundEmailStatus =
  | "received"
  | "parsed"
  | "matched"
  | "unassigned"
  | "failed";

export type ParsedBooking = {
  kind?: DreamerBookingKind;
  cities?: string[];
  fromIata?: string | null;
  toIata?: string | null;
  cabin?: string | null;
  confirmation?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  hotelName?: string | null;
  vendor?: string | null;
  nights?: number | null;
  /** Explicit flight number from the confirmation, e.g. NH118. */
  flightNumber?: string | null;
  /** Local departure time HH:MM when the email states it. */
  departureLocal?: string | null;
  /** Local arrival time HH:MM when the email states it. */
  arrivalLocal?: string | null;
};

export type DreamerMailbox = {
  ownerId: string;
  token: string;
  address: string;
};

export type DreamerBooking = {
  id: string;
  ownerId: string;
  futureTripId?: string | null;
  tripId?: string | null;
  inboundEmailId?: string | null;
  kind: DreamerBookingKind;
  title: string;
  summary?: string | null;
  parsed: ParsedBooking;
  startsAt?: string | null;
  endsAt?: string | null;
  matchScore?: number | null;
  source: DreamerBookingSource;
  createdAt: string;
  updatedAt: string;
};

export type InboundEmailRow = {
  id: string;
  messageId: string;
  ownerId?: string | null;
  fromAddress?: string | null;
  toAddresses: string[];
  subject?: string | null;
  textBody?: string | null;
  htmlBody?: string | null;
  status: InboundEmailStatus;
  parseError?: string | null;
  receivedAt: string;
};

export type DreamerSuggestion = {
  id: string;
  kind: "climate" | "stay" | "nearby" | "note" | "detour";
  title: string;
  body: string;
  confidence: "catalog" | "forecast" | "estimate" | "search";
  transportMethod?: string | null;
  costEstimateLabel?: string | null;
  reviewStatus?: "pending" | "accepted" | "dismissed";
};

export type DreamerStayEvent = {
  title: string;
  date: string;
  sourceUrl: string;
  snippet: string;
};

export type DreamerStayAdvise = {
  events: DreamerStayEvent[];
  stayUntil: string | null;
  rationale: string;
  catalogStayHint?: string | null;
};
