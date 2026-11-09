export type DreamerBookingKind = "flight" | "hotel" | "rail" | "other";
export type DreamerBookingSource = "email_forward" | "manual";
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
  status: InboundEmailStatus;
  parseError?: string | null;
  receivedAt: string;
};

export type DreamerSuggestion = {
  id: string;
  kind: "climate" | "stay" | "nearby" | "note";
  title: string;
  body: string;
  confidence: "catalog" | "forecast" | "estimate";
};
