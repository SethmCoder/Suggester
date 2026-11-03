/**
 * 10 local app test cases for Waypoint.
 * Unit cases run always; HTTP cases need the app on BASE_URL (default http://localhost:3000).
 */
import { describe, expect, it } from "vitest";
import { checkVisitAgainstHours } from "@/lib/ai/hours";
import { addMinutes, orderByNearestNeighbor } from "@/lib/ai/scheduler";
import {
  DEMO_TRIP_ID,
  getDemoTripPayload,
} from "@/lib/demo/data";
import {
  combinePersonalizationRank,
  scoreMentionAggregate,
} from "@/lib/popularity/score";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3001";

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  return res;
}

async function post(path: string, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  return res;
}

function cookieFrom(res: Response): string | undefined {
  // Node fetch may expose set-cookie as getSetCookie()
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = anyHeaders.getSetCookie?.() ?? [];
  if (list.length) {
    return list.map((c) => c.split(";")[0]).join("; ");
  }
  const raw = res.headers.get("set-cookie");
  return raw ? raw.split(";")[0] : undefined;
}

describe("Waypoint — 10 local test cases", () => {
  // TC1
  it("TC1: home page returns 200 and mentions Waypoint", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Waypoint/i);
    expect(html).toMatch(/Try demo|demo|Waypoint/i);
  });

  // TC2
  it("TC2: login page loads", async () => {
    const res = await get("/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Sign in|Log In|Welcome back/i);
  });

  // TC3
  it("TC3: demo start sets cookie and returns demo trip id", async () => {
    const res = await post("/api/demo/start");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tripId: string; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.tripId).toBe(DEMO_TRIP_ID);
    const cookie = cookieFrom(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/waypoint_demo/);
  });

  // TC4
  it("TC4: demo session lists the sample Paris trip", async () => {
    const start = await post("/api/demo/start");
    const cookie = cookieFrom(start);
    expect(cookie).toBeTruthy();
    const res = await fetch(`${BASE}/api/trips`, {
      headers: { Cookie: cookie! },
      signal: AbortSignal.timeout(15000),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      isDemo: boolean;
      trips: { id: string; destination: string }[];
    };
    expect(data.isDemo).toBe(true);
    expect(data.trips.length).toBeGreaterThan(0);
    expect(data.trips[0].id).toBe(DEMO_TRIP_ID);
    expect(data.trips[0].destination).toMatch(/Paris/i);
  });

  // TC5
  it("TC5: demo itinerary page loads with demo banner content", async () => {
    const start = await post("/api/demo/start");
    const cookie = cookieFrom(start);
    const res = await fetch(`${BASE}/trips/${DEMO_TRIP_ID}`, {
      headers: { Cookie: cookie! },
      signal: AbortSignal.timeout(20000),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Demo|sample|illustrative/i);
    expect(html).toMatch(/Paris/i);
  });

  // TC6
  it("TC6: demo end clears session", async () => {
    const start = await post("/api/demo/start");
    const cookie = cookieFrom(start);
    const end = await fetch(`${BASE}/api/demo/end`, {
      method: "POST",
      headers: { Cookie: cookie! },
      signal: AbortSignal.timeout(15000),
    });
    expect(end.status).toBe(200);
  });

  // TC7
  it("TC7: demo payload has 4 days and labeled demo activities", () => {
    const payload = getDemoTripPayload();
    expect(payload.isDemo).toBe(true);
    expect(payload.days).toHaveLength(4);
    expect(payload.activities.length).toBeGreaterThanOrEqual(8);
    expect(payload.activities.every((a) => a.source === "demo")).toBe(true);
  });

  // TC8
  it("TC8: popularity scoring prefers recent multi-source mentions", () => {
    const now = new Date("2026-01-01");
    const weak = scoreMentionAggregate(
      {
        normalizedName: "Place",
        destinationHint: "Paris",
        sourceCount: 1,
        mentions: [
          {
            source: "a",
            title: "old",
            snippet: "",
            url: "https://example.com/a",
            publishedAt: new Date("2020-01-01"),
          },
        ],
      },
      "p1",
      now,
    );
    const strong = scoreMentionAggregate(
      {
        normalizedName: "Place",
        destinationHint: "Paris",
        sourceCount: 3,
        mentions: [
          {
            source: "a",
            title: "new",
            snippet: "",
            url: "https://example.com/a",
            publishedAt: new Date("2025-12-20"),
          },
          {
            source: "b",
            title: "new",
            snippet: "",
            url: "https://example.com/b",
            publishedAt: new Date("2025-12-22"),
          },
          {
            source: "c",
            title: "new",
            snippet: "",
            url: "https://example.com/c",
            publishedAt: new Date("2025-12-25"),
          },
        ],
      },
      "p1",
      now,
    );
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  // TC9
  it("TC9: personalization still beats popularity alone; hours warn when unverified", () => {
    const personalWins = combinePersonalizationRank({
      interestMatch: 0.95,
      geoFit: 0.9,
      popularityScore: 10,
      popularityConfidence: 0.4,
      popularityWeight: 0.35,
      prefersHiddenGems: false,
    });
    const viralOnly = combinePersonalizationRank({
      interestMatch: 0.15,
      geoFit: 0.15,
      popularityScore: 99,
      popularityConfidence: 1,
      popularityWeight: 0.35,
      prefersHiddenGems: false,
    });
    expect(personalWins).toBeGreaterThan(viralOnly);

    const hours = checkVisitAgainstHours({
      openingHours: undefined,
      visitStartTime: "10:00",
      durationMinutes: 60,
      dayDate: new Date("2026-06-01"),
    });
    expect(hours.ok).toBe(true);
    expect(hours.warning).toMatch(/unverified/i);
  });

  // TC10
  it("TC10: scheduler orders nearby stops and addMinutes works", () => {
    const ordered = orderByNearestNeighbor(
      [
        { id: "far", lat: 48.9, lng: 2.4 },
        { id: "near", lat: 48.86, lng: 2.3 },
        { id: "mid", lat: 48.87, lng: 2.32 },
      ],
      { lat: 48.85, lng: 2.29 },
    );
    expect(ordered[0].id).toBe("near");
    expect(addMinutes("09:00", 90)).toBe("10:30");
    expect(addMinutes("23:30", 60)).toBe("00:30");
  });
});
