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
>(items: T[]): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  let previous = "";
  for (const item of items) {
    if (item.placeId.startsWith("flight:") || item.placeId.startsWith("transit:")) {
      kept.push(item);
      previous = "";
      continue;
    }
    const bucket = experienceBucket(item.types ?? [], item.name);
    if (bucket !== "other" && bucket === previous && item.priority !== "must_see") {
      dropped.push(item);
      continue;
    }
    kept.push(item);
    previous = bucket;
  }
  return { kept, dropped };
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
    if (/avi|aircraft|\bplane\b|\bflight\b/i.test(interest)) {
      add("aviation museum");
      add("aircraft museum");
    }
    if (/architect/i.test(interest)) add("historic building");
    if (/histor/i.test(interest)) add("historic site");
  }
  if (!out.length) add("tourist attraction");
  return out.slice(0, 6);
}
