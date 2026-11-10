import { citiesFromParsedIatas } from "./iata-cities";
import type { ParsedBooking } from "./types";

const IATA = /\b([A-Z]{3})\b/g;

/**
 * Deterministic booking extraction from confirmation text.
 * Never invents confirmation codes — only captures explicit PNR-like tokens.
 */
export function parseBookingFromEmailText(input: {
  subject?: string | null;
  text?: string | null;
}): ParsedBooking {
  const blob = `${input.subject ?? ""}\n${input.text ?? ""}`;
  const upper = blob.toUpperCase();

  const route =
    blob.match(/\b([A-Z]{3})\s*(?:→|->|to|TO)\s*([A-Z]{3})\b/) ||
    blob.match(/\bfrom\s+([A-Z]{3})\s+to\s+([A-Z]{3})\b/i);

  let fromIata: string | null = route?.[1]?.toUpperCase() ?? null;
  let toIata: string | null = route?.[2]?.toUpperCase() ?? null;

  if (!fromIata || !toIata) {
    const codes = [...upper.matchAll(IATA)]
      .map((m) => m[1])
      .filter((c) => !["THE", "AND", "FOR", "YOU", "UTC", "GMT", "PDF"].includes(c));
    if (!fromIata && codes[0]) fromIata = codes[0];
    if (!toIata && codes[1]) toIata = codes[1];
  }

  const dateMatch =
    blob.match(/\b(20\d{2}-\d{2}-\d{2})\b/) ||
    blob.match(
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+20\d{2})?)\b/i,
    );

  let startDate: string | null = null;
  if (dateMatch?.[1]) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateMatch[1])) {
      startDate = dateMatch[1];
    } else {
      const d = new Date(dateMatch[1]);
      if (!Number.isNaN(d.getTime())) {
        startDate = d.toISOString().slice(0, 10);
      }
    }
  }

  const confMatch = blob.match(
    /\b(?:confirmation(?:\s*(?:#|number|code))?|PNR|record locator)\s*[:#]?\s*([A-Z0-9]{5,8})\b/i,
  );
  const rawConf = confMatch?.[1]?.toUpperCase() ?? null;
  const confirmation =
    rawConf &&
    !["SUBJECT", "FLIGHT", "HOTEL", "THANKS", "NUMBER", "CODE"].includes(rawConf)
      ? rawConf
      : null;

  const cabinMatch = blob.match(
    /\b(economy|premium economy|business|first)\b/i,
  );
  const cabin = cabinMatch?.[1]?.toLowerCase() ?? null;

  const hotelMatch = blob.match(
    /\b(?:hotel|stay at|reservation at)\s+([A-Z][A-Za-z0-9 &'.,-]{2,60})/i,
  );

  const cities = new Set<string>();
  for (const c of citiesFromParsedIatas({ fromIata, toIata })) cities.add(c);
  if (/tokyo|hnd|nrt/i.test(blob)) cities.add("Tokyo");
  if (/paris|cdg|ory/i.test(blob)) cities.add("Paris");
  if (/rome|fco/i.test(blob)) cities.add("Rome");
  if (/barcelona|bcn/i.test(blob)) cities.add("Barcelona");
  if (/cairo|egypt|cai/i.test(blob)) cities.add("Cairo");
  if (/seattle|sea\b/i.test(blob)) cities.add("Seattle");
  if (/london|lhr|lgw/i.test(blob)) cities.add("London");
  if (/dubai|dxb/i.test(blob)) cities.add("Dubai");
  if (/osaka|kix/i.test(blob)) cities.add("Osaka");

  let kind: ParsedBooking["kind"] = "other";
  if (fromIata && toIata) kind = "flight";
  else if (hotelMatch || /\bhotel\b/i.test(blob)) kind = "hotel";
  else if (/\btrain|rail\b/i.test(blob)) kind = "rail";

  return {
    kind,
    cities: [...cities],
    fromIata,
    toIata,
    cabin,
    confirmation,
    startDate,
    endDate: null,
    hotelName: hotelMatch?.[1]?.trim() ?? null,
    vendor: null,
    nights: null,
  };
}

/** Inherit city/date context from a primary (usually flight) booking onto a secondary. */
export function inheritBookingContext(
  secondary: ParsedBooking,
  primary: ParsedBooking | null | undefined,
): ParsedBooking {
  if (!primary) return secondary;
  const cities =
    secondary.cities?.length
      ? secondary.cities
      : primary.cities?.length
        ? primary.cities
        : [];
  return {
    ...secondary,
    cities,
    startDate: secondary.startDate ?? primary.startDate ?? null,
    endDate: secondary.endDate ?? primary.endDate ?? null,
  };
}

export function verifyInboundSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) {
    return process.env.DREAMER_INBOUND_ALLOW_UNSIGNED === "1";
  }
  if (!signatureHeader) return false;
  return (
    signatureHeader === secret ||
    signatureHeader === `sha256=${secret}` ||
    signatureHeader.includes(secret)
  );
}
