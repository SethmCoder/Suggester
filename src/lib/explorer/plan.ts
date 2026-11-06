import { groqChat } from "@/lib/ai/groq";
import type { ExplorerCategory, ExplorerPlace, ExplorerPreferences } from "./types";
import { keepKnownPlaces, keepKnownPlan, mergePreferences } from "./validate";

export type SearchBrief = {
  city: string;
  ask: string | null;
  searches: { query: string; category?: string }[];
  reuse: boolean;
  itinerary: boolean;
  days: number;
  budget: string;
  preferences: ExplorerPreferences;
};

const BRIEF_SYSTEM = `You plan real-world place searches for a travel guide. Return JSON only.
Extract the city, whether they want a full daily itinerary, how many days (1-7), and up to 3 search queries.
Queries must name the city and a kind of place, such as "architecture museums in Tokyo". Do not name a specific business.
If they are revising a previous result and previous places were supplied, set reuse to true and searches to [].
If the city is missing, set ask to one short question and searches to [].
Do not invent businesses. categories may include restaurants, attractions, architecture, museums, nature, shopping, entertainment, hidden.
{"city":"","ask":null,"searches":[{"query":"","category":"attractions"}],"reuse":false,"itinerary":false,"days":1,"budget":"any","preferences":{"cuisine":"","pace":"","avoid":"","atmosphere":""}}`;

const RANK_SYSTEM = `You are a travel planner. You may only mention places from the supplied list. Return JSON only.
Pick at most 8 place ids. Write why in one sentence using only the supplied name, category, address, rating, price, or hours. If a field is null, do not invent it.
If itinerary is true, build a daily plan using only those ids. Each day needs a title and stops with startTime HH:MM between 08:00 and 21:00, durationMinutes 45-150, and a short note. Group nearby stops. Include a meal when a restaurant is in the list. Do not schedule a place whose hours say it is closed at that time. Leave gaps between stops.
{"reply":"","picks":[{"id":"","why":""}],"plan":[{"title":"","stops":[{"placeId":"","startTime":"10:00","durationMinutes":90,"note":""}]}],"followUps":["",""]}`;

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function understandRequest(input: {
  model: string;
  message: string;
  city: string;
  categories: ExplorerCategory[];
  budget: string;
  preferences: ExplorerPreferences;
  history: { role: string; text: string }[];
  hasPlaces: boolean;
}): Promise<SearchBrief> {
  const fallback: SearchBrief = {
    city: input.city.trim(),
    ask: input.city.trim() ? null : "Which city should I look through?",
    searches: input.city.trim()
      ? [{ query: `${input.message} in ${input.city}`.slice(0, 120), category: input.categories[0] }]
      : [],
    reuse: false,
    itinerary: /\bitinerary|plan my|day by day|days\b/i.test(input.message),
    days: 3,
    budget: input.budget || "any",
    preferences: input.preferences,
  };
  if (!process.env.GROQ_API_KEY) return fallback;
  try {
    const raw = await groqChat({
      model: input.model,
      temperature: 0.2,
      effort: "low",
      optional: true,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: BRIEF_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            message: input.message,
            city: input.city,
            categories: input.categories,
            budget: input.budget,
            preferences: input.preferences,
            history: input.history.slice(-6),
            previousPlacesAvailable: input.hasPlaces,
          }),
        },
      ],
    });
    const parsed = JSON.parse(raw || "{}") as {
      city?: unknown;
      ask?: unknown;
      searches?: { query?: unknown; category?: unknown }[];
      reuse?: unknown;
      itinerary?: unknown;
      days?: unknown;
      budget?: unknown;
      preferences?: Partial<ExplorerPreferences>;
    };
    const city = clip(parsed.city, 80) || input.city.trim();
    const searches = (parsed.searches ?? [])
      .map((search) => ({
        query: clip(search.query, 140),
        category: clip(search.category, 40),
      }))
      .filter((search) => search.query)
      .slice(0, 3);
    return {
      city,
      ask: city ? null : clip(parsed.ask, 160) || "Which city should I look through?",
      searches: parsed.reuse === true && input.hasPlaces ? [] : searches,
      reuse: parsed.reuse === true && input.hasPlaces,
      itinerary: parsed.itinerary === true,
      days: Math.min(7, Math.max(1, Number(parsed.days) || 1)),
      budget: clip(parsed.budget, 12) || input.budget || "any",
      preferences: mergePreferences(input.preferences, parsed.preferences),
    };
  } catch {
    return fallback;
  }
}

export async function rankPlaces(input: {
  model: string;
  message: string;
  city: string;
  places: ExplorerPlace[];
  itinerary: boolean;
  days: number;
  preferences: ExplorerPreferences;
}): Promise<{ reply: string; places: ExplorerPlace[]; plan: ReturnType<typeof keepKnownPlan>; followUps: string[] }> {
  const listed = input.places.slice(0, 18).map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    address: place.address,
    rating: place.rating,
    reviews: place.reviewCount,
    price: place.priceLevel,
    hours: place.hours,
  }));
  const fallbackPlaces = input.places.slice(0, 6).map((place) => ({
    ...place,
    why: `Returned for this search in ${input.city}.`,
  }));
  if (!process.env.GROQ_API_KEY) {
    return {
      reply: `I found ${fallbackPlaces.length} places in ${input.city}. The planner is offline, so these are the search results without an extra ranking.`,
      places: fallbackPlaces,
      plan: [],
      followUps: [],
    };
  }
  try {
    const raw = await groqChat({
      model: input.model,
      temperature: 0.3,
      effort: "low",
      optional: true,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: RANK_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            message: input.message,
            city: input.city,
            itinerary: input.itinerary,
            days: input.days,
            preferences: input.preferences,
            places: listed,
          }),
        },
      ],
    });
    const parsed = JSON.parse(raw || "{}") as {
      reply?: unknown;
      picks?: { id?: unknown; why?: unknown }[];
      plan?: { title?: unknown; stops?: { placeId?: unknown; startTime?: unknown; durationMinutes?: unknown; note?: unknown }[] }[];
      followUps?: unknown[];
    };
    const places = keepKnownPlaces(parsed.picks ?? [], input.places);
    const chosen = places.length ? places : fallbackPlaces;
    const plan = input.itinerary ? keepKnownPlan(parsed.plan ?? [], chosen) : [];
    const followUps = (parsed.followUps ?? [])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 3);
    return {
      reply: clip(parsed.reply, 700) || `Here are places in ${input.city} that match this search.`,
      places: chosen,
      plan,
      followUps,
    };
  } catch {
    return {
      reply: `I found places in ${input.city}, and the ranking step did not finish. These are the search results.`,
      places: fallbackPlaces,
      plan: [],
      followUps: [],
    };
  }
}
