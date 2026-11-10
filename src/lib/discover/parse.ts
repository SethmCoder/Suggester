import { groqChat } from "@/lib/ai/groq";
import { DESTINATION_CATALOG } from "./catalog";
import type {
  BudgetTier,
  DiscoverInterest,
  DiscoverRegion,
  DiscoveryFilters,
} from "./types";
import { tierFromBudget } from "./score";

const INTEREST_WORDS: { re: RegExp; interest: DiscoverInterest }[] = [
  { re: /architect/i, interest: "architecture" },
  { re: /histor/i, interest: "history" },
  { re: /food|restaurant|cuisine|culinary/i, interest: "food" },
  { re: /nature|hike|mountain|park|outdoor/i, interest: "nature" },
  { re: /aviation|aircraft|airport|flight museum/i, interest: "aviation" },
  { re: /beach|coast|ocean|sea/i, interest: "beaches" },
  { re: /cultur/i, interest: "culture" },
  { re: /nightlife|bar|club/i, interest: "nightlife" },
  { re: /museum|gallery/i, interest: "museums" },
  { re: /adventure|trek|surf/i, interest: "adventure" },
  { re: /shop/i, interest: "shopping" },
];

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const REGIONS: { re: RegExp; region: DiscoverRegion }[] = [
  { re: /europe/i, region: "europe" },
  { re: /asia|japan|korea|southeast/i, region: "asia" },
  { re: /north america|canada|united states|\busa\b/i, region: "north-america" },
  { re: /latin america|south america|mexico/i, region: "latin-america" },
  { re: /middle east|gulf|uae/i, region: "middle-east" },
  { re: /africa/i, region: "africa" },
  { re: /oceania|australia|new zealand/i, region: "oceania" },
];

export function parseDiscoveryQueryLocal(text: string): DiscoveryFilters {
  const lower = text.toLowerCase();
  const interests = INTEREST_WORDS.filter((row) => row.re.test(text)).map(
    (row) => row.interest,
  );
  const uniqueInterests = [...new Set(interests)];

  let budgetMax: number | undefined;
  const money = text.match(/\$\s?([\d,]+)/) || text.match(/([\d,]+)\s*(?:dollars|usd)/i);
  if (money) budgetMax = Number(money[1].replace(/,/g, ""));

  let durationDays: number | undefined;
  const days = text.match(/(\d+)\s*days?/i);
  if (days) durationDays = Number(days[1]);

  let seasonMonth: number | undefined;
  for (const [name, month] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
      seasonMonth = month;
      break;
    }
  }

  let climate: DiscoveryFilters["climate"] = "either";
  if (/warm|hot|beach|sunny|mild winter/i.test(lower)) climate = "warm";
  if (/cool|cold|snow|winter city/i.test(lower) && !/warm/i.test(lower)) climate = "cool";

  let region: DiscoverRegion | undefined;
  for (const row of REGIONS) {
    if (row.re.test(text)) {
      region = row.region;
      break;
    }
  }

  const similar =
    text.match(/similar to\s+([a-zA-Z\s-]+?)(?:\s+but|\s+with|[.,]|$)/i)?.[1]?.trim() ||
    text.match(/like\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1]?.trim();

  const international = /international|abroad|overseas/i.test(text);
  const lesserKnownOnly = /less crowded|lesser-known|hidden|quieter|off the beaten/i.test(
    text,
  );

  const budgetTier: BudgetTier | undefined = tierFromBudget(budgetMax);

  return {
    query: text,
    interests: uniqueInterests,
    budgetMax,
    budgetTier,
    durationDays,
    region,
    seasonMonth,
    climate,
    international,
    similarTo: similar,
    lesserKnownOnly: lesserKnownOnly || undefined,
  };
}

function sanitizeShortlist(ids: unknown): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  const allowed = new Set(DESTINATION_CATALOG.map((row) => row.id));
  const out: string[] = [];
  for (const value of ids) {
    if (typeof value !== "string") continue;
    const id = value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!allowed.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= 8) break;
  }
  return out.length ? out : undefined;
}

/** Ask the model which catalog cities best answer the question (ids only). */
export async function shortlistCatalogIds(
  text: string,
  interests: DiscoverInterest[] = [],
): Promise<string[] | undefined> {
  const catalogLines = DESTINATION_CATALOG.map(
    (row) =>
      `${row.id}|${row.name}|${row.country}|${row.region}|${row.interests.join(",")}|${row.lesserKnown ? "quieter" : "headline"}`,
  ).join("\n");
  const modeled = await groqChat({
    optional: true,
    effort: "low",
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You pick destinations for a traveler from a FIXED catalog only. Return JSON {\"ids\":[\"id\",...]} with 5–8 catalog ids best matching their question and interests, best first. Prefer specific fits (budget, vibe, region, season, quieter options) over repeating the same headline capitals every time. Never invent ids outside the catalog list.",
      },
      {
        role: "user",
        content: `Question: ${text}\nInterests: ${interests.join(", ") || "unspecified"}\nCatalog (id|name|country|region|interests|note):\n${catalogLines}`,
      },
    ],
  });
  if (!modeled) return undefined;
  try {
    const parsed = JSON.parse(modeled) as { ids?: unknown };
    return sanitizeShortlist(parsed.ids);
  } catch {
    return undefined;
  }
}

export async function parseDiscoveryQuery(text: string): Promise<DiscoveryFilters> {
  const local = parseDiscoveryQueryLocal(text);
  const modeled = await groqChat({
    optional: true,
    effort: "low",
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract travel discovery filters as JSON. Keys: interests (array from architecture,history,food,nature,aviation,beaches,culture,nightlife,museums,adventure,shopping), budgetMax (number or null), durationDays (number or null), region (europe|asia|north-america|latin-america|middle-east|africa|oceania or null), seasonMonth (1-12 or null), climate (warm|cool|either), international (boolean), similarTo (string or null), lesserKnownOnly (boolean), ids (array of 5–8 catalog destination ids that best answer the question, best first, or null). Do not invent destination names or ids outside the catalog. Use null when unknown.",
      },
      {
        role: "user",
        content: `Question: ${text}\nValid catalog ids: ${DESTINATION_CATALOG.map((row) => row.id).join(", ")}`,
      },
    ],
  });
  if (!modeled) return local;
  try {
    const parsed = JSON.parse(modeled) as Partial<DiscoveryFilters> & {
      ids?: unknown;
    };
    const shortlistIds =
      sanitizeShortlist(parsed.ids) ??
      sanitizeShortlist((parsed as { shortlistIds?: unknown }).shortlistIds);
    return {
      query: text,
      interests: Array.isArray(parsed.interests) && parsed.interests.length
        ? (parsed.interests as DiscoverInterest[])
        : local.interests,
      budgetMax: typeof parsed.budgetMax === "number" ? parsed.budgetMax : local.budgetMax,
      budgetTier: tierFromBudget(
        typeof parsed.budgetMax === "number" ? parsed.budgetMax : local.budgetMax,
      ),
      durationDays:
        typeof parsed.durationDays === "number" ? parsed.durationDays : local.durationDays,
      region: (parsed.region as DiscoverRegion | undefined) || local.region,
      seasonMonth:
        typeof parsed.seasonMonth === "number" ? parsed.seasonMonth : local.seasonMonth,
      climate: parsed.climate || local.climate,
      international: parsed.international ?? local.international,
      similarTo: parsed.similarTo || local.similarTo,
      lesserKnownOnly: parsed.lesserKnownOnly ?? local.lesserKnownOnly,
      shortlistIds,
    };
  } catch {
    return local;
  }
}
