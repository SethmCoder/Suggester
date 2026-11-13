import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import { groqChat } from "@/lib/ai/groq";
import { seedPackingList } from "@/lib/trips/packing";

export type SampleListKind = "packing";

export type SampleListResult = {
  kind: SampleListKind;
  destination: string;
  title: string;
  items: string[];
  source: "ai" | "catalog";
  note?: string;
};

function findCatalogMatch(destination: string) {
  const key = destination.trim().toLowerCase();
  if (!key) return undefined;
  return DESTINATION_CATALOG.find(
    (d) =>
      d.name.toLowerCase() === key ||
      key.includes(d.name.toLowerCase()) ||
      d.name.toLowerCase().includes(key) ||
      d.country.toLowerCase() === key,
  );
}

/** Destination-aware packing extras from the catalog (no invented places). */
export function catalogPackingExtras(destination: string): string[] {
  const hit = findCatalogMatch(destination);
  if (!hit) {
    return ["Comfortable day bag", "Reusable water bottle"];
  }
  const extras: string[] = [];
  const region = hit.region;
  if (region === "asia") {
    extras.push("Portable Wi‑Fi / eSIM", "Easy-on shoes for transit");
  }
  if (region === "europe") {
    extras.push("Light scarf / layer", "Adapter for EU outlets");
  }
  if (region === "middle-east") {
    extras.push("Sun protection", "Modest cover-up for religious sites");
  }
  if (region === "oceania" || region === "latin-america" || region === "africa") {
    extras.push("Strong sunscreen", "Insect repellent if outdoors");
  }
  if (hit.interests.includes("nature")) {
    extras.push("Trail shoes or sturdy sneakers");
  }
  if (hit.interests.includes("beaches")) {
    extras.push("Swimwear", "Quick-dry towel");
  }
  if (hit.budgetTier === "higher") {
    extras.push("Smart-casual outfit for nicer dinners");
  }
  // Climate hint from warm months vs typical travel — keep generic.
  extras.push(`City day bag for ${hit.name}`);
  return [...new Set(extras)].slice(0, 8);
}

export function buildCatalogPackingSample(input: {
  destination: string;
  party?: string | null;
  durationDays?: number | null;
  wetWeather?: boolean;
}): SampleListResult {
  const base = seedPackingList({
    party: input.party,
    durationDays: input.durationDays,
    wetWeather: input.wetWeather,
  }).map((i) => i.label);
  const extras = catalogPackingExtras(input.destination);
  const items = [...new Set([...base, ...extras])];
  const hit = findCatalogMatch(input.destination);
  return {
    kind: "packing",
    destination: input.destination,
    title: hit
      ? `Sample packing for ${hit.name}`
      : `Sample packing for ${input.destination || "your trip"}`,
    items,
    source: "catalog",
    note: hit
      ? `Based on the Waypoint catalog profile for ${hit.name}, ${hit.country}.`
      : "General trip essentials — name a city for a tighter sample.",
  };
}

function parseItemList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.length < 80)
      .slice(0, 18);
  } catch {
    return [];
  }
}

/**
 * AI packing sample for a destination, with catalog fallback.
 * Lists gear/clothing only — never invents places, bookings, or hours.
 */
export async function generatePackingSampleList(input: {
  destination: string;
  party?: string | null;
  durationDays?: number | null;
  wetWeather?: boolean;
  interests?: string[];
}): Promise<SampleListResult> {
  const fallback = buildCatalogPackingSample(input);
  const destination = input.destination.trim();
  if (!destination || !process.env.GROQ_API_KEY) return fallback;

  const hit = findCatalogMatch(destination);
  const raw = await groqChat({
    optional: true,
    temperature: 0.4,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You write short packing checklists for travelers. Return JSON: {"items":["..."]}.
Rules:
- Only packing/gear/clothing/documents — never invent attractions, restaurants, hotels, or bookings.
- Tailor items to the destination climate, customs, and trip length when known.
- 10–16 concrete items. No fluff. No brand names unless essential (e.g. adapter type).`,
      },
      {
        role: "user",
        content: JSON.stringify({
          destination,
          country: hit?.country,
          region: hit?.region,
          durationDays: input.durationDays ?? 4,
          party: input.party ?? "couple",
          wetWeather: Boolean(input.wetWeather),
          interests: input.interests ?? hit?.interests ?? [],
          catalogHints: hit
            ? {
                experiences: hit.experiences,
                transitNote: hit.transitNote,
                warmMonths: hit.warmMonths,
              }
            : null,
        }),
      },
    ],
  });

  const aiItems = parseItemList(raw);
  if (aiItems.length < 6) return fallback;

  return {
    kind: "packing",
    destination,
    title: `Sample packing for ${hit?.name || destination}`,
    items: aiItems,
    source: "ai",
    note: "AI sample tailored to this destination — edit anything that does not fit.",
  };
}

