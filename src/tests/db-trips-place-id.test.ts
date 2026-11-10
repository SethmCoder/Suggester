import { describe, expect, it } from "vitest";

/** Mirrors saveGeneratedItinerary place_id dedupe for activities_day_place_uq. */
function dedupePlaceIds(placeIds: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return placeIds.map((raw) => {
    const id = raw?.trim() || null;
    if (!id) return null;
    if (seen.has(id)) return null;
    seen.add(id);
    return id;
  });
}

describe("activity place_id dedupe", () => {
  it("keeps the first id and nulls repeats so unique(day, place) can insert", () => {
    expect(dedupePlaceIds(["osm:1", "osm:1", "", null, "osm:2", "osm:2"])).toEqual([
      "osm:1",
      null,
      null,
      null,
      "osm:2",
      null,
    ]);
  });
});
