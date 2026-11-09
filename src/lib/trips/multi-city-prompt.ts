export type CityPace = "relaxed" | "balanced" | "packed";

export type StructuredMultiCityPlan = {
  destinations: string[];
  nights?: number | null;
  tripWide: {
    interests: string[];
    hotelBudgetPerNight?: number | null;
    hotelNearAttractions?: boolean;
  };
  cityPreferences: Record<
    string,
    {
      pace?: CityPace;
      interests?: string[];
    }
  >;
};

const CITY_ALIASES = [
  "Paris",
  "Rome",
  "Barcelona",
  "Tokyo",
  "Kyoto",
  "Seoul",
  "Lisbon",
  "London",
  "Cairo",
  "Osaka",
];

function detectPace(chunk: string): CityPace | undefined {
  if (/relax/i.test(chunk)) return "relaxed";
  if (/active|packed|busy|full/i.test(chunk)) return "packed";
  if (/moderate|balanced/i.test(chunk)) return "balanced";
  return undefined;
}

/**
 * Extract destinations and per-city preferences from a long planning message.
 * Deterministic — does not invent cities that are not named.
 */
export function parseMultiCityPrompt(message: string): StructuredMultiCityPlan {
  const destinations = CITY_ALIASES.filter((city) =>
    new RegExp(`\\b${city}\\b`, "i").test(message),
  );

  const nightsMatch = message.match(/\b(\d+)\s*-?\s*nights?\b/i);
  const nights = nightsMatch ? Number(nightsMatch[1]) : null;

  const budgetMatch = message.match(/\$?\s*(\d+)\s*(?:per night|\/night)/i);
  const hotelBudgetPerNight = budgetMatch ? Number(budgetMatch[1]) : null;

  const interests: string[] = [];
  if (/histor/i.test(message)) interests.push("history");
  if (/restaurant|food|local food/i.test(message)) interests.push("food");
  if (/lesser-known|hidden|local places/i.test(message)) interests.push("culture");
  if (/museum/i.test(message)) interests.push("museums");

  const cityPreferences: StructuredMultiCityPlan["cityPreferences"] = {};
  for (const city of destinations) {
    const re = new RegExp(`${city}[^.!?]{0,120}`, "i");
    const chunk = message.match(re)?.[0] ?? "";
    const pace = detectPace(chunk);
    if (pace) {
      cityPreferences[city] = { pace };
    }
  }

  // Also catch "relaxed pace in Paris" style
  for (const city of destinations) {
    const re = new RegExp(
      `(relaxed|moderate|balanced|active|packed)[^.!?]{0,40}${city}|${city}[^.!?]{0,40}(relaxed|moderate|balanced|active|packed)`,
      "i",
    );
    const m = message.match(re);
    if (m) {
      const pace = detectPace(m[0]);
      if (pace) {
        cityPreferences[city] = {
          ...(cityPreferences[city] ?? {}),
          pace,
        };
      }
    }
  }

  return {
    destinations,
    nights,
    tripWide: {
      interests,
      hotelBudgetPerNight,
      hotelNearAttractions: /hotels?\s+near/i.test(message),
    },
    cityPreferences,
  };
}

/** Keep patches scoped when the user names a single city. */
export function cityScopedEditTarget(message: string): string | null {
  const only = message.match(
    /\b(?:only|just)\s+(?:change|update|edit|fix)\s+([A-Z][a-z]+)\b/i,
  );
  if (only) return only[1];
  const inCity = message.match(
    /\b(?:in|for)\s+([A-Z][a-z]+)\s+(?:only|just)\b/i,
  );
  return inCity?.[1] ?? null;
}

export function filterActivitiesOutsideCity<T extends { planning_note?: string | null; address?: string | null; name?: string }>(
  activities: T[],
  city: string,
): T[] {
  const n = city.toLowerCase();
  return activities.filter((a) => {
    const hay = `${a.planning_note ?? ""} ${a.address ?? ""} ${a.name ?? ""}`.toLowerCase();
    return !hay.includes(n) && !hay.includes(`city=${n}`);
  });
}
