/** Parse comma/newline stop lists from the Plan a Trip major-stops UI. */
export function splitStopList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\n]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ].slice(0, 24);
}

export function mergeTripStops(input: {
  majorStops?: string[];
  mustSeeText?: string;
  preferredText?: string;
  wishlistMust?: string[];
  wishlistPreferred?: string[];
}): { mustSee: string[]; preferred: string[] } {
  const mustSee = [
    ...new Set([
      ...(input.majorStops ?? []).map((s) => s.trim()).filter(Boolean),
      ...splitStopList(input.mustSeeText),
      ...(input.wishlistMust ?? []).map((s) => s.trim()).filter(Boolean),
    ]),
  ].slice(0, 24);

  const mustLower = new Set(mustSee.map((s) => s.toLowerCase()));
  const preferred = [
    ...new Set([
      ...splitStopList(input.preferredText),
      ...(input.wishlistPreferred ?? []).map((s) => s.trim()).filter(Boolean),
    ]),
  ]
    .filter((name) => !mustLower.has(name.toLowerCase()))
    .slice(0, 24);

  return { mustSee, preferred };
}

/** Soft name match used when boosting candidates or checking schedule coverage. */
export function nameMatchesStop(placeName: string, stop: string): boolean {
  const a = placeName.trim().toLowerCase();
  const b = stop.trim().toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function idealTripWithMajorStops(
  idealTrip: string,
  majorStops: string[],
): string {
  if (!majorStops.length) return idealTrip;
  const line = `Major stops the traveler already chose (schedule these, then fill the rest of each day from interests): ${majorStops.join("; ")}.`;
  if (!idealTrip.trim()) return line;
  if (/major stops the traveler already chose/i.test(idealTrip)) return idealTrip;
  return `${idealTrip.trim()}\n\n${line}`;
}
