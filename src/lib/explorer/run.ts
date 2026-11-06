import type { ExplorerCategory, ExplorerPlace, ExplorerPreferences, ExplorerResult } from "./types";
import { understandRequest, rankPlaces } from "./plan";
import { searchExplorerPlaces } from "./search";
import { emptyPreferences, withTravelEstimates } from "./validate";

export async function runExplorer(input: {
  model: string;
  message: string;
  city: string;
  categories: ExplorerCategory[];
  budget: string;
  preferences: ExplorerPreferences;
  history: { role: string; text: string }[];
  previousPlaces: ExplorerPlace[];
  excludeIds: string[];
}): Promise<ExplorerResult> {
  const brief = await understandRequest({
    model: input.model,
    message: input.message,
    city: input.city,
    categories: input.categories,
    budget: input.budget,
    preferences: input.preferences.cuisine ? input.preferences : emptyPreferences(),
    history: input.history,
    hasPlaces: input.previousPlaces.length > 0,
  });
  const preferences = brief.preferences;
  if (!brief.city || brief.ask) {
    return {
      reply: brief.ask || "Which city should I look through?",
      city: brief.city,
      source: "none",
      notice: null,
      places: [],
      plan: [],
      followUps: [],
      preferences,
    };
  }

  let pool = input.previousPlaces;
  let source: ExplorerResult["source"] = input.previousPlaces[0]?.source ?? "none";
  let notice: string | null = null;
  if (!brief.reuse || !pool.length) {
    const searched = await searchExplorerPlaces({
      city: brief.city,
      searches: brief.searches.length
        ? brief.searches
        : [{ query: `${input.message} in ${brief.city}`.slice(0, 140) }],
      categories: input.categories,
      budget: brief.budget || input.budget,
      excludeIds: input.excludeIds,
    });
    pool = searched.places;
    source = searched.source;
    notice = searched.notice;
  }

  if (!pool.length) {
    return {
      reply: notice || `I could not find places in ${brief.city} for that request.`,
      city: brief.city,
      source,
      notice,
      places: [],
      plan: [],
      followUps: ["Try a broader category", "Name a neighborhood"],
      preferences,
    };
  }

  const ranked = await rankPlaces({
    model: input.model,
    message: input.message,
    city: brief.city,
    places: pool,
    itinerary: brief.itinerary,
    days: brief.days,
    preferences,
  });
  return {
    reply: ranked.reply,
    city: brief.city,
    source,
    notice,
    places: ranked.places,
    plan: withTravelEstimates(ranked.plan, ranked.places),
    followUps: ranked.followUps,
    preferences,
  };
}
