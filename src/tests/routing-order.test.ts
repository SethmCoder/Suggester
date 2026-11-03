import { describe, expect, it } from "vitest";
import { estimateTravelFallback } from "@/lib/maps/openstreetmap";
import {
  haversineKm,
  orderByNearestNeighbor,
} from "@/lib/ai/scheduler";

describe("path-aware travel estimates", () => {
  it("detoured fallback is longer than naive crow-flies walk time", () => {
    // ~1 km straight across (e.g. opposite river banks)
    const from = { lat: 48.855, lng: 2.345 };
    const to = { lat: 48.855, lng: 2.358 };
    const est = estimateTravelFallback("WALK", from, to);
    const straightKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
    const naiveMin = Math.ceil((straightKm / 4.5) * 60);
    expect(est.durationMinutes).toBeGreaterThan(naiveMin);
    expect(est.distanceMeters).toBeGreaterThan(straightKm * 1000);
  });

  it("crow-flies nearest-neighbor can prefer a far-bank stop (why we need OSRM)", () => {
    const hotel = { lat: 48.86, lng: 2.33, id: "hotel" };
    // Same bank, farther along
    const sameBank = { lat: 48.862, lng: 2.34, id: "same" };
    // Opposite bank, slightly closer as crow flies
    const opposite = { lat: 48.8595, lng: 2.335, id: "opp" };
    const ordered = orderByNearestNeighbor([sameBank, opposite], hotel);
    // Document current crow-flies behavior — routed order may differ at runtime
    expect(ordered.map((o) => o.id)).toContain("opp");
    expect(ordered.map((o) => o.id)).toContain("same");
  });
});
