import { citiesFromParsedIatas } from "./iata-cities";
import type { ParsedBooking } from "./types";

const IATA = /\b([A-Z]{3})\b/g;

/** Convert "9:15 PM" / "13:20" / "1:06pm" → HH:MM (24h). */
export function parseClockToHHMM(raw: string): string | null {
  const t = raw.trim();
  const m24 = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2]);
    const ap = m12[3].toLowerCase().startsWith("p");
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    if (ap && h < 12) h += 12;
    if (!ap && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

function extractLabeledTime(
  blob: string,
  labels: RegExp,
): string | null {
  const m = blob.match(
    new RegExp(
      `${labels.source}\\s*[:#]?\\s*(\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[AaPp]\\.?[Mm\\.])?)`,
      labels.flags.includes("i") ? "i" : "i",
    ),
  );
  return m?.[1] ? parseClockToHHMM(m[1]) : null;
}

/**
 * Deterministic booking extraction from confirmation text.
 * Never invents confirmation codes — only captures explicit PNR-like tokens.
 * Flight times come from the email itself (no live flight API).
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

  // Only take an explicitly labeled flight number — never guess from PNR tokens.
  const flightMatch = blob.match(
    /\b(?:flight(?:\s*(?:number|#))?|flt)\s*[:#]?\s*([A-Z]{2}\s?\d{1,4})\b/i,
  );
  const flightNumber = flightMatch?.[1]
    ? flightMatch[1].replace(/\s+/g, "").toUpperCase()
    : null;

  const departureLocal = extractLabeledTime(
    blob,
    /(?:scheduled\s+)?depart(?:ure|s|ed)?(?:\s+time)?/,
  );
  const arrivalLocal = extractLabeledTime(
    blob,
    /(?:scheduled\s+|estimated\s+)?arriv(?:al|es|ed)?(?:\s+time)?/,
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
    flightNumber,
    departureLocal,
    arrivalLocal,
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
    flightNumber: secondary.flightNumber ?? primary.flightNumber ?? null,
    departureLocal: secondary.departureLocal ?? primary.departureLocal ?? null,
    arrivalLocal: secondary.arrivalLocal ?? primary.arrivalLocal ?? null,
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
