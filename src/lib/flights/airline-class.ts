/** Airline class from published IATA codes. This is not a fare. */

export type PricePoint = "any" | "budget" | "standard" | "premium";

export type AirlineOption = {
  code: string;
  name: string;
};

const BUDGET = new Set([
  "WN", "NK", "F9", "FR", "U2", "W6", "VY", "DY", "D8", "TR", "AK", "6E",
  "G4", "EW", "Y4", "G3", "JQ", "MM", "LS", "HV", "PC", "FZ", "XY", "5J",
  "ZG", "F8", "W9", "RK",
]);

const PREMIUM = new Set([
  "EK", "SQ", "QR", "CX", "NH", "JL", "LH", "AF", "BA", "DL", "UA", "AA",
  "QF", "KE", "BR", "LX", "TK", "KL", "IB", "AZ", "OS", "AY", "SK", "AC",
  "NZ", "CI", "CA", "MU", "CZ", "VS", "EY", "SV", "AI", "OZ",
]);

export function pricePointOf(airline: AirlineOption): Exclude<PricePoint, "any"> {
  const code = airline.code.trim().toUpperCase();
  if (BUDGET.has(code)) return "budget";
  if (PREMIUM.has(code)) return "premium";
  return "standard";
}

export function filterAirlines(
  airlines: AirlineOption[],
  input: { airlines?: string; pricePoint?: PricePoint },
): AirlineOption[] {
  const needles = (input.airlines ?? "")
    .split(/[,/]|\band\b/i)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 2);
  const point = input.pricePoint ?? "any";
  return airlines.filter((airline) => {
    if (needles.length) {
      const blob = `${airline.name} ${airline.code}`.toLowerCase();
      if (!needles.some((needle) => blob.includes(needle))) return false;
    }
    if (point === "any") return true;
    return pricePointOf(airline) === point;
  });
}

export function flightRestrictionNote(input: {
  chosen?: string;
  preferred?: string;
  pricePoint?: PricePoint;
  matches: AirlineOption[];
}): string {
  const point = input.pricePoint && input.pricePoint !== "any" ? input.pricePoint : "";
  const names = input.matches.slice(0, 4).map((airline) => airline.name);
  const bits: string[] = [];
  if (input.chosen?.trim()) bits.push(`Traveler chose ${input.chosen.trim()}.`);
  else if (input.preferred?.trim()) {
    bits.push(`Airline restriction: ${input.preferred.trim()}.`);
  }
  if (point) bits.push(`Price point: ${point}.`);
  if (names.length) {
    bits.push(`Published airlines that match: ${names.join(", ")}.`);
  } else if (bits.length) {
    bits.push("No published airline on this route matches those restrictions.");
  }
  if (bits.length) bits.push("No fare is shown.");
  return bits.join(" ");
}
