import { groqChat } from "@/lib/ai/groq";
import { redactSecretsForLlm } from "@/lib/dreamer/redact-secrets";
import type { ParsedBooking } from "@/lib/dreamer/types";

function asKind(value: unknown): ParsedBooking["kind"] {
  if (value === "flight" || value === "hotel" || value === "rail" || value === "other") {
    return value;
  }
  return "other";
}

/**
 * When regex parse is thin, ask Groq for structured booking fields from
 * already-redacted confirmation text. Never send payment/credential material.
 */
export async function assistParseBookingFromText(input: {
  subject?: string | null;
  text: string;
}): Promise<Partial<ParsedBooking> | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const safe = redactSecretsForLlm(
    `${input.subject ?? ""}\n${input.text}`.slice(0, 12_000),
  );
  if (safe.trim().length < 20) return null;

  const raw = await groqChat({
    temperature: 0.1,
    effort: "low",
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract travel booking fields from a confirmation email (any language). Return JSON only:
{"kind":"flight|hotel|rail|other","fromIata":"AAA|null","toIata":"BBB|null","startDate":"YYYY-MM-DD|null","endDate":"YYYY-MM-DD|null","hotelName":"string|null","flightNumber":"XX123|null","confirmation":"PNR|null","cities":["City"],"cabin":"economy|business|first|null","departureLocal":"HH:MM|null","arrivalLocal":"HH:MM|null","nights":number|null}
Rules: never invent PNRs, card numbers, or passwords. Omit unreadable fields as null. Prefer IATA codes when present.`,
      },
      { role: "user", content: safe },
    ],
  });
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cities = Array.isArray(parsed.cities)
      ? parsed.cities.filter((c): c is string => typeof c === "string" && c.trim().length >= 2)
      : [];
    return {
      kind: asKind(parsed.kind),
      fromIata:
        typeof parsed.fromIata === "string" ? parsed.fromIata.toUpperCase() : null,
      toIata:
        typeof parsed.toIata === "string" ? parsed.toIata.toUpperCase() : null,
      startDate:
        typeof parsed.startDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)
          ? parsed.startDate
          : null,
      endDate:
        typeof parsed.endDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate)
          ? parsed.endDate
          : null,
      hotelName:
        typeof parsed.hotelName === "string" ? parsed.hotelName.trim() : null,
      flightNumber:
        typeof parsed.flightNumber === "string"
          ? parsed.flightNumber.replace(/\s+/g, "").toUpperCase()
          : null,
      confirmation:
        typeof parsed.confirmation === "string"
          ? parsed.confirmation.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) ||
            null
          : null,
      cities,
      cabin: typeof parsed.cabin === "string" ? parsed.cabin.toLowerCase() : null,
      departureLocal:
        typeof parsed.departureLocal === "string" ? parsed.departureLocal : null,
      arrivalLocal:
        typeof parsed.arrivalLocal === "string" ? parsed.arrivalLocal : null,
      nights: typeof parsed.nights === "number" ? parsed.nights : null,
    };
  } catch {
    return null;
  }
}

export function needsLlmBookingAssist(parsed: ParsedBooking): boolean {
  if (parsed.kind === "other" && !parsed.confirmation) return true;
  if (!parsed.startDate) return true;
  if (parsed.kind === "flight" && (!parsed.fromIata || !parsed.toIata)) return true;
  if (parsed.kind === "hotel" && !parsed.hotelName) return true;
  return false;
}

export function mergeBookingParse(
  base: ParsedBooking,
  assist: Partial<ParsedBooking> | null | undefined,
): ParsedBooking {
  if (!assist) return base;
  return {
    kind: base.kind !== "other" ? base.kind : assist.kind ?? base.kind,
    cities:
      base.cities?.length
        ? base.cities
        : assist.cities?.length
          ? assist.cities
          : [],
    fromIata: base.fromIata ?? assist.fromIata ?? null,
    toIata: base.toIata ?? assist.toIata ?? null,
    cabin: base.cabin ?? assist.cabin ?? null,
    confirmation: base.confirmation ?? assist.confirmation ?? null,
    startDate: base.startDate ?? assist.startDate ?? null,
    endDate: base.endDate ?? assist.endDate ?? null,
    hotelName: base.hotelName ?? assist.hotelName ?? null,
    vendor: base.vendor ?? assist.vendor ?? null,
    nights: base.nights ?? assist.nights ?? null,
    flightNumber: base.flightNumber ?? assist.flightNumber ?? null,
    departureLocal: base.departureLocal ?? assist.departureLocal ?? null,
    arrivalLocal: base.arrivalLocal ?? assist.arrivalLocal ?? null,
  };
}
