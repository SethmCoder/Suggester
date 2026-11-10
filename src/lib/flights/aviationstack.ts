/**
 * AviationStack flight-number lookup + status.
 * Falls back gracefully when AVIATIONSTACK_API_KEY is unset.
 */

export type FlightStatusResult = {
  found: boolean;
  source: "aviationstack" | "none";
  flightNumber: string;
  airline: string | null;
  fromIata: string | null;
  toIata: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  scheduledArrivalLocal: string | null;
  estimatedArrivalLocal: string | null;
  /** HH:MM local arrival when available */
  arrivalTime: string | null;
  status: string | null;
  delayMinutes: number | null;
  delayed: boolean;
  date: string | null;
  rawNote?: string;
};

function normalizeFlightNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function pickTime(isoOrLocal: string | null | undefined): string | null {
  if (!isoOrLocal) return null;
  const m = isoOrLocal.match(/T(\d{2}:\d{2})/);
  if (m) return m[1];
  if (/^\d{2}:\d{2}/.test(isoOrLocal)) return isoOrLocal.slice(0, 5);
  return null;
}

export function hasAviationStackKey(): boolean {
  return Boolean(process.env.AVIATIONSTACK_API_KEY?.trim());
}

type StackFlight = {
  flight_date?: string;
  flight_status?: string;
  departure?: {
    iata?: string;
    airport?: string;
    scheduled?: string;
    estimated?: string;
    delay?: number | null;
  };
  arrival?: {
    iata?: string;
    airport?: string;
    scheduled?: string;
    estimated?: string;
    delay?: number | null;
  };
  airline?: { name?: string; iata?: string };
  flight?: { iata?: string; number?: string };
};

export async function lookupFlightByNumber(input: {
  flightNumber: string;
  date?: string | null;
}): Promise<FlightStatusResult> {
  const flightNumber = normalizeFlightNumber(input.flightNumber);
  const empty: FlightStatusResult = {
    found: false,
    source: "none",
    flightNumber,
    airline: null,
    fromIata: null,
    toIata: null,
    departureAirport: null,
    arrivalAirport: null,
    scheduledArrivalLocal: null,
    estimatedArrivalLocal: null,
    arrivalTime: null,
    status: null,
    delayMinutes: null,
    delayed: false,
    date: input.date ?? null,
  };

  if (!flightNumber || flightNumber.length < 3) return empty;

  const key = process.env.AVIATIONSTACK_API_KEY?.trim();
  if (!key) {
    return {
      ...empty,
      rawNote: "AVIATIONSTACK_API_KEY not set — enter arrival time manually.",
    };
  }

  const params = new URLSearchParams({
    access_key: key,
    flight_iata: flightNumber,
    limit: "1",
  });
  if (input.date) params.set("flight_date", input.date);

  try {
    const res = await fetch(
      `https://api.aviationstack.com/v1/flights?${params}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) {
      return { ...empty, rawNote: `AviationStack HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      data?: StackFlight[];
      error?: { message?: string };
    };
    if (data.error?.message) {
      return { ...empty, rawNote: data.error.message };
    }
    const row = data.data?.[0];
    if (!row) {
      return {
        ...empty,
        source: "aviationstack",
        rawNote: "Flight not found — enter arrival time manually.",
      };
    }

    const delay =
      typeof row.arrival?.delay === "number"
        ? row.arrival.delay
        : typeof row.departure?.delay === "number"
          ? row.departure.delay
          : null;
    const scheduled = row.arrival?.scheduled ?? null;
    const estimated = row.arrival?.estimated ?? scheduled;
    const status = row.flight_status ?? null;

    return {
      found: true,
      source: "aviationstack",
      flightNumber: row.flight?.iata || flightNumber,
      airline: row.airline?.name ?? row.airline?.iata ?? null,
      fromIata: row.departure?.iata ?? null,
      toIata: row.arrival?.iata ?? null,
      departureAirport: row.departure?.airport ?? null,
      arrivalAirport: row.arrival?.airport ?? null,
      scheduledArrivalLocal: scheduled,
      estimatedArrivalLocal: estimated,
      arrivalTime: pickTime(estimated) ?? pickTime(scheduled),
      status,
      delayMinutes: delay,
      delayed:
        (delay != null && delay > 0) ||
        /delay|divert|cancel/i.test(status ?? ""),
      date: row.flight_date ?? input.date ?? null,
    };
  } catch (err) {
    return {
      ...empty,
      rawNote: err instanceof Error ? err.message : "Lookup failed",
    };
  }
}
