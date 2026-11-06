import { describe, expect, it } from "vitest";
import { classifyPageviewChange } from "@/lib/interest/wikimedia-pageviews";
import { dedupeDiscoveredPlaces } from "@/lib/places/osm-discover";
import {
  combineDiscoveryRank,
  effectiveWeights,
  DEFAULT_DISCOVERY_WEIGHTS,
} from "@/lib/places/rank";
import type { DiscoveredPlace, OnlineInterestSignal } from "@/lib/places/types";

describe("wikimedia pageview classification", () => {
  it("marks increasing when recent views rise enough", () => {
    const r = classifyPageviewChange({
      recentViews: 1200,
      previousViews: 800,
    });
    expect(r.classification).toBe("increasing");
    expect(r.percentChange).toBeGreaterThan(15);
  });

  it("returns neutral when baseline is too low", () => {
    const r = classifyPageviewChange({
      recentViews: 50,
      previousViews: 40,
    });
    expect(r.classification).toBeNull();
    expect(r.confidence).toBe("none");
  });

  it("marks decreasing for large drops", () => {
    const r = classifyPageviewChange({
      recentViews: 400,
      previousViews: 1000,
    });
    expect(r.classification).toBe("decreasing");
  });
});

describe("discovery rank weights", () => {
  it("redistributes online-interest weight when missing", () => {
    const w = effectiveWeights(DEFAULT_DISCOVERY_WEIGHTS, false);
    expect(w.onlineInterest).toBe(0);
    const sum =
      w.relevance + w.geography + w.quality + w.budget + w.pace + w.variety;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("keeps traveler relevance dominant over interest", () => {
    const increasing: OnlineInterestSignal = {
      placeId: "x",
      wikipediaTitle: "Eiffel_Tower",
      classification: "increasing",
      confidence: "high",
      percentChange: 40,
      recentViews: 10000,
      previousViews: 7000,
      label: "Online interest increasing",
      source: "wikimedia_pageviews",
      retrievedAt: new Date().toISOString(),
    };
    const withInterest = combineDiscoveryRank({
      relevance: 0.2,
      geography: 0.5,
      quality: 0.5,
      interest: increasing,
    });
    const highRelevance = combineDiscoveryRank({
      relevance: 1,
      geography: 0.5,
      quality: 0.5,
      interest: null,
    });
    expect(highRelevance).toBeGreaterThan(withInterest);
  });
});

describe("OSM discover helpers", () => {
  it("dedupes by osmId", () => {
    const base: DiscoveredPlace = {
      placeId: "osm:node:1",
      name: "Test",
      category: "museum",
      address: null,
      lat: 1,
      lng: 2,
      osmId: "node/1",
      tags: {},
      wikipediaTitle: null,
      wikidataId: null,
      source: "openstreetmap",
      retrievedAt: new Date().toISOString(),
    };
    const out = dedupeDiscoveredPlaces([base, { ...base }]);
    expect(out).toHaveLength(1);
  });
});
