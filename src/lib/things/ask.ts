import { groqChat } from "@/lib/ai/groq";
import { searchExplorerPlaces } from "@/lib/explorer/search";
import type { ExplorerCategory, ExplorerPlace } from "@/lib/explorer/types";

const CATEGORIES: { category: ExplorerCategory; pattern: RegExp; label: string }[] = [
  { category: "restaurants", pattern: /restaurant|food|eat|cafe|market/i, label: "restaurants" },
  { category: "museums", pattern: /museum|gallery/i, label: "museums" },
  { category: "nature", pattern: /park|outdoor|hike|nature|garden/i, label: "parks" },
  { category: "architecture", pattern: /architect/i, label: "architecture" },
  { category: "shopping", pattern: /shop|market/i, label: "markets" },
  { category: "entertainment", pattern: /show|music|night/i, label: "entertainment" },
  { category: "hidden", pattern: /hidden|unusual|local/i, label: "local places" },
];

export function localThingsQuery(message: string, city: string): {
  city: string;
  query: string;
  category: ExplorerCategory;
  ask: string | null;
} {
  const named = city.trim() || cityFrom(message);
  const match = CATEGORIES.find((item) => item.pattern.test(message));
  const category = match?.category ?? "attractions";
  const label = match?.label ?? "things to do";
  if (!named) {
    return { city: "", query: "", category, ask: "Which area should I look through?" };
  }
  return {
    city: named,
    query: `${label} in ${named}`.slice(0, 140),
    category,
    ask: null,
  };
}

function cityFrom(message: string): string {
  const match = message.match(/\bin\s+([A-Za-z][A-Za-z .'-]{1,40})/);
  const city = match?.[1]?.replace(/\b(today|tomorrow|please)\b/gi, "").trim() ?? "";
  return city.replace(/[?.!]+$/, "");
}

export async function searchThings(input: {
  message: string;
  city: string;
}): Promise<{
  reply: string;
  city: string;
  places: ExplorerPlace[];
  notice: string | null;
  center: { lat: number; lng: number } | null;
}> {
  const local = localThingsQuery(input.message, input.city);
  let city = local.city;
  let query = local.query;
  let category = local.category;
  if (local.ask) {
    return { reply: local.ask, city: "", places: [], notice: null, center: null };
  }
  const refined = await groqChat({
    temperature: 0.2,
    effort: "low",
    optional: true,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Turn this into one place search. Reply JSON {"city":"","query":""}. The query names a kind of place and the city, such as "museums in Kyoto". Do not name a specific business. Do not build an itinerary.',
      },
      { role: "user", content: JSON.stringify({ message: input.message, city: local.city }) },
    ],
  });
  if (refined) {
    try {
      const parsed = JSON.parse(refined) as { city?: unknown; query?: unknown };
      if (typeof parsed.city === "string" && parsed.city.trim()) city = parsed.city.trim().slice(0, 80);
      if (typeof parsed.query === "string" && parsed.query.trim() && parsed.query.toLowerCase().includes(city.toLowerCase())) {
        query = parsed.query.trim().slice(0, 140);
      }
    } catch {
      /* the local query still runs */
    }
  }

  const found = await searchExplorerPlaces({
    city,
    searches: [{ query, category }],
    categories: [category],
    budget: "any",
    excludeIds: [],
  });
  if (!found.places.length) {
    return {
      reply: `No listed places came back for that search in ${city}.`,
      city,
      places: [],
      notice: found.notice,
      center: found.center,
    };
  }
  const names = found.places.slice(0, 6).map((place) => place.name).join(", ");
  return {
    reply: `Here are places listed for ${city}: ${names}.`,
    city,
    places: found.places,
    notice: found.notice,
    center: found.center,
  };
}
