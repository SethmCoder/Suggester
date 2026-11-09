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
    blob.match(
      /\b(20\d{2}-\d{2}-\d{2})\b/,
    ) ||
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
    /\b(?:confirmation|conf(?:irmation)?(?:\s*#| number)?|PNR|record locator)\s*[:#]?\s*([A-Z0-9]{5,8})\b/i,
  );
  const confirmation = confMatch?.[1]?.toUpperCase() ?? null;

  const cabinMatch = blob.match(
    /\b(economy|premium economy|business|first)\b/i,
  );
  const cabin = cabinMatch?.[1]?.toLowerCase() ?? null;

  const hotelMatch = blob.match(
    /\b(?:hotel|stay at|reservation at)\s+([A-Z][A-Za-z0-9 &'.,-]{2,60})/i,
  );

  const cities: string[] = [];
  if (/tokyo|hnd|nrt/i.test(blob)) cities.push("Tokyo");
  if (/paris|cdg|ory/i.test(blob)) cities.push("Paris");
  if (/rome|fco/i.test(blob)) cities.push("Rome");
  if (/barcelona|bcn/i.test(blob)) cities.push("Barcelona");
  if (/cairo|egypt|cai/i.test(blob)) cities.push("Cairo");
  if (/seattle|sea\b/i.test(blob)) cities.push("Seattle");

  let kind: ParsedBooking["kind"] = "other";
  if (fromIata && toIata) kind = "flight";
  else if (hotelMatch || /\bhotel\b/i.test(blob)) kind = "hotel";
  else if (/\btrain|rail\b/i.test(blob)) kind = "rail";

  return {
    kind,
    cities,
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

export function verifyInboundSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) {
    // Dev without secret: accept only when explicitly allowed.
    return process.env.DREAMER_INBOUND_ALLOW_UNSIGNED === "1";
  }
  if (!signatureHeader) return false;
  // Resend-style: simple shared secret header match for v1.
  return (
    signatureHeader === secret ||
    signatureHeader === `sha256=${secret}` ||
    signatureHeader.includes(secret)
  );
}
