import { describe, expect, it } from "vitest";
import {
  combinePersonalizationRank,
  scoreMentionAggregate,
} from "@/lib/popularity/score";

describe("popularity scoring", () => {
  it("decays older mentions", () => {
    const old = scoreMentionAggregate(
      {
        normalizedName: "Eiffel Tower",
        destinationHint: "Paris",
        sourceCount: 2,
        mentions: [
          {
            source: "a",
            title: "Paris",
            snippet: "visit",
            url: "https://example.com/a",
            publishedAt: new Date("2020-01-01"),
          },
        ],
      },
      "pid",
      new Date("2026-01-01"),
    );
    const recent = scoreMentionAggregate(
      {
        normalizedName: "Eiffel Tower",
        destinationHint: "Paris",
        sourceCount: 2,
        mentions: [
          {
            source: "a",
            title: "Paris",
            snippet: "visit",
            url: "https://example.com/a",
            publishedAt: new Date("2025-12-01"),
          },
          {
            source: "b",
            title: "Paris",
            snippet: "visit",
            url: "https://example.com/b",
            publishedAt: new Date("2025-12-15"),
          },
        ],
      },
      "pid",
      new Date("2026-01-01"),
    );
    expect(recent.score).toBeGreaterThan(old.score);
  });

  it("does not let popularity override personalization entirely", () => {
    const lowPop = combinePersonalizationRank({
      interestMatch: 0.9,
      geoFit: 0.9,
      popularityScore: 10,
      popularityConfidence: 0.5,
      popularityWeight: 0.35,
      prefersHiddenGems: false,
    });
    const highPop = combinePersonalizationRank({
      interestMatch: 0.2,
      geoFit: 0.2,
      popularityScore: 95,
      popularityConfidence: 1,
      popularityWeight: 0.35,
      prefersHiddenGems: false,
    });
    expect(lowPop).toBeGreaterThan(highPop);
  });
});
