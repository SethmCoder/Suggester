/**
 * Sync IATA → city map for Dreamer matching (no network).
 * Arrival airport wins for dream assignment (SEA→HND → Tokyo).
 */
const IATA_CITY: Record<string, string> = {
  HND: "Tokyo",
  NRT: "Tokyo",
  SEA: "Seattle",
  CDG: "Paris",
  ORY: "Paris",
  FCO: "Rome",
  CIA: "Rome",
  BCN: "Barcelona",
  CAI: "Cairo",
  LHR: "London",
  LGW: "London",
  STN: "London",
  JFK: "New York",
  EWR: "New York",
  LGA: "New York",
  SFO: "San Francisco",
  LAX: "Los Angeles",
  ORD: "Chicago",
  DXB: "Dubai",
  AUH: "Abu Dhabi",
  SIN: "Singapore",
  ICN: "Seoul",
  GMP: "Seoul",
  BKK: "Bangkok",
  SYD: "Sydney",
  MEL: "Melbourne",
  YVR: "Vancouver",
  YYZ: "Toronto",
  AMS: "Amsterdam",
  FRA: "Frankfurt",
  MUC: "Munich",
  MAD: "Madrid",
  LIS: "Lisbon",
  ATH: "Athens",
  IST: "Istanbul",
  DOH: "Doha",
  HKG: "Hong Kong",
  TPE: "Taipei",
  KIX: "Osaka",
  ITM: "Osaka",
  CTS: "Sapporo",
  KMJ: "Kumamoto",
};

export function cityFromIata(iata: string | null | undefined): string | null {
  if (!iata) return null;
  return IATA_CITY[iata.trim().toUpperCase()] ?? null;
}

export function citiesFromParsedIatas(input: {
  fromIata?: string | null;
  toIata?: string | null;
}): string[] {
  const out: string[] = [];
  const arrival = cityFromIata(input.toIata);
  const origin = cityFromIata(input.fromIata);
  if (arrival) out.push(arrival);
  if (origin && origin !== arrival) out.push(origin);
  return out;
}

export function primaryArrivalCity(input: {
  cities?: string[];
  toIata?: string | null;
}): string | null {
  const fromIata = cityFromIata(input.toIata);
  if (fromIata) return fromIata;
  return input.cities?.[0] ?? null;
}
