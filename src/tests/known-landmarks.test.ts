import { describe, expect, it } from "vitest";
import {
  assignDayClusters,
  catalogPlaceId,
  getLandmarksForCluster,
} from "@/lib/trips/known-landmarks";
import { parkDayAssignmentsFromText } from "@/lib/trips/known-parks";

describe("known-landmarks Tokyo west nightlife", () => {
  it("seeds Omoide Yokocho and Golden Gai in the west cluster with catalog ids", () => {
    const west = { id: "west", displayName: "w", lat: 0, lng: 0, dayTheme: "" };
    const landmarks = getLandmarksForCluster(west, "Tokyo");
    const ids = landmarks.map((lm) => lm.id);
    expect(ids).toContain("omoide-yokocho");
    expect(ids).toContain("golden-gai");

    const omoide = landmarks.find((lm) => lm.id === "omoide-yokocho")!;
    const golden = landmarks.find((lm) => lm.id === "golden-gai")!;
    expect(catalogPlaceId(omoide)).toBe("catalog:omoide-yokocho");
    expect(catalogPlaceId(golden)).toBe("catalog:golden-gai");
    expect(omoide.types).toEqual(
      expect.arrayContaining(["nightlife", "evening", "shinjuku"]),
    );
    expect(golden.types).toEqual(
      expect.arrayContaining(["nightlife", "evening", "shinjuku"]),
    );

    // Balanced 4-stop days must still reach nightlife after Meiji/Takeshita/Shibuya.
    const top4 = ids.slice(0, 4);
    expect(top4).toContain("omoide-yokocho");
    expect(ids.indexOf("shibuya-crossing")).toBeLessThan(
      ids.indexOf("omoide-yokocho"),
    );
  });

  it("assigns west modern day after Disneyland/DisneySea park days", () => {
    const parks = parkDayAssignmentsFromText(
      "Day 2 Tokyo Disneyland. Day 3 Tokyo DisneySea.",
      ["Tokyo Disneyland", "Tokyo DisneySea"],
      5,
    );
    expect(parks.get(1)?.id).toBe("tokyo-disneyland");
    expect(parks.get(2)?.id).toBe("tokyo-disneysea");

    const clusters = assignDayClusters(5, new Set(parks.keys()), "Tokyo");
    expect(clusters.get(0)?.id).toBe("east");
    expect(clusters.get(3)?.id).toBe("west");
    expect(clusters.get(4)?.id).toBe("central");
    expect(clusters.get(3)?.dayTheme).toMatch(/Omoide Yokocho|Golden Gai/i);
  });
});
