export function experienceBucket(types: string[], name: string): string {
  const blob = `${types.join(" ")} ${name}`.toLowerCase();
  if (/restaurant|cafe|fast_food|food_court|bar|pub/.test(blob)) return "food";
  if (/museum|gallery/.test(blob)) return "museum";
  if (/park|garden|nature|viewpoint/.test(blob)) return "park";
  if (/temple|shrine|church|mosque|worship/.test(blob)) return "worship";
  if (/attraction|monument|landmark/.test(blob)) return "sight";
  return "other";
}

export function explainStop(input: {
  name: string;
  types: string[];
  city?: string;
  previousName?: string;
  hours: "open" | "unknown";
  hoursWindow?: string;
}): string {
  const bucket = experienceBucket(input.types, input.name);
  const kind = bucket === "other" ? "listed place" : bucket;
  const where = input.previousName
    ? `It follows ${input.previousName} on this day's route.`
    : `It starts the day${input.city ? ` in ${input.city}` : ""}.`;
  const hours =
    input.hours === "open" && input.hoursWindow
      ? `Published hours cover ${input.hoursWindow}.`
      : "Opening hours are not listed, so this time is not confirmed.";
  return `${input.name} is a ${kind} kept for this day. ${where} ${hours}`;
}

export function noteIsGeneric(note?: string): boolean {
  if (!note?.trim()) return true;
  return /popular attraction|worth visiting|free day|free block|a great place/i.test(note);
}

export function dropRepeatedExperiences<
  T extends { placeId: string; name: string; priority?: string; types?: string[] },
>(
  items: T[],
  options?: { minSightseeing?: number },
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  let previous = "";
  const bucketCounts = new Map<string, number>();
  const seenNames = new Set<string>();
  for (const item of items) {
    if (
      item.placeId.startsWith("flight:") ||
      item.placeId.startsWith("transit:") ||
      item.placeId.startsWith("hotel:") ||
      item.placeId.startsWith("restaurant:booked:")
    ) {
      kept.push(item);
      previous = "";
      continue;
    }
    const nameKey = item.name.trim().toLowerCase();
    if (nameKey && seenNames.has(nameKey) && item.priority !== "must_see") {
      dropped.push(item);
      continue;
    }
    const bucket = experienceBucket(item.types ?? [], item.name);
    const count = bucketCounts.get(bucket) ?? 0;
    if (
      bucket !== "other" &&
      item.priority !== "must_see" &&
      (bucket === previous || count >= 2)
    ) {
      dropped.push(item);
      continue;
    }
    kept.push(item);
    previous = bucket;
    bucketCounts.set(bucket, count + 1);
    if (nameKey) seenNames.add(nameKey);
  }

  // Don't gut a day when the candidate pool is mostly one experience type.
  const minSightseeing = options?.minSightseeing ?? 0;
  const sightseeingCount = (list: T[]) =>
    list.filter(
      (item) =>
        !item.placeId.startsWith("flight:") &&
        !item.placeId.startsWith("transit:"),
    ).length;
  if (minSightseeing > 0 && sightseeingCount(kept) < minSightseeing) {
    for (const item of dropped.splice(0)) {
      if (sightseeingCount(kept) >= minSightseeing) {
        dropped.push(item);
        continue;
      }
      kept.push(item);
    }
  }
  return { kept, dropped };
}

/** Synonyms so “museums” matches OSM type `museum`, etc. */
export function interestSynonyms(interest: string): string[] {
  const token = interest.trim().toLowerCase();
  if (!token) return [];
  const extras: string[] = [token];
  if (/museum/.test(token)) extras.push("museum", "gallery");
  if (/food|culin|restaurant|eat/.test(token)) {
    extras.push("restaurant", "cafe", "food", "cuisine");
  }
  if (/nature|outdoor|park|hike/.test(token)) {
    extras.push("park", "garden", "nature", "viewpoint");
  }
  if (/histor|cultur/.test(token)) {
    extras.push("historic", "monument", "attraction", "museum");
  }
  if (/architect/.test(token)) extras.push("building", "historic", "monument");
  if (/avi|aircraft|\bplane\b|\bflight\b/.test(token)) {
    extras.push("aviation", "aircraft", "museum");
  }
  if (/night|bar|club/.test(token)) extras.push("bar", "pub", "nightclub");
  if (/beach/.test(token)) extras.push("beach", "coast", "waterfront");
  if (/shop/.test(token)) extras.push("shop", "mall", "market");
  return [...new Set(extras)];
}

export function expandInterestQueries(interests: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (query: string) => {
    const key = query.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(query.trim());
  };
  for (const interest of interests) {
    add(interest);
    for (const syn of interestSynonyms(interest)) add(syn);
    if (/avi|aircraft|\bplane\b|\bflight\b/i.test(interest)) {
      add("aviation museum");
      add("aircraft museum");
    }
    if (/architect/i.test(interest)) add("historic building");
    if (/histor/i.test(interest)) add("historic site");
  }
  if (!out.length) add("tourist attraction");
  return out.slice(0, 8);
}

export function validateAiDay(input: {
  dayIndex: number;
  activities: { placeId: string }[];
  allowedPlaceIds: Set<string>;
  placeCity?: Map<string, string | undefined>;
  dayCity?: string;
}): { kept: { placeId: string }[]; warnings: string[] } {
  const kept: { placeId: string }[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const activity of input.activities) {
    if (!input.allowedPlaceIds.has(activity.placeId)) {
      warnings.push(
        `Day ${input.dayIndex + 1}: dropped unknown placeId ${activity.placeId}.`,
      );
      continue;
    }
    if (seen.has(activity.placeId)) {
      warnings.push(
        `Day ${input.dayIndex + 1}: dropped duplicate ${activity.placeId}.`,
      );
      continue;
    }
    const city = input.placeCity?.get(activity.placeId);
    if (input.dayCity && city && city !== input.dayCity) {
      warnings.push(
        `Day ${input.dayIndex + 1}: dropped ${activity.placeId} (wrong city).`,
      );
      continue;
    }
    seen.add(activity.placeId);
    kept.push(activity);
  }
  return { kept, warnings };
}
