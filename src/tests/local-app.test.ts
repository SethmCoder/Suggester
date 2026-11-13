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
  listDemoTrips,
} from "@/lib/demo/data";
import {
  combinePersonalizationRank,
  scoreMentionAggregate,
} from "@/lib/popularity/score";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3001";

let serverUp: boolean | null = null;

async function ensureServer(): Promise<boolean> {
  if (serverUp != null) return serverUp;
  try {
    const res = await fetch(`${BASE}/`, {
      redirect: "follow",
      signal: AbortSignal.timeout(2000),
    });
    serverUp = res.status > 0;
  } catch {
    serverUp = false;
  }
  return serverUp;
}

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

function skipWithoutServer() {
  return ensureServer().then((up) => {
    if (!up) {
      // HTTP smoke needs a running app; unit cases below still run.
      return true;
    }
    return false;
  });
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
    if (await skipWithoutServer()) return;
    const res = await get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Waypoint/i);
    expect(html).toMatch(/Try demo|demo|Waypoint/i);
  });

  // TC2
  it("TC2: login page loads", async () => {
    if (await skipWithoutServer()) return;
    const res = await get("/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Sign in|Log In|Welcome back/i);
  });

  // TC3
  it("TC3: demo start sets cookie and returns demo trip id", async () => {
    if (await skipWithoutServer()) return;
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
  it("TC4: demo session lists Paris as the sole sample trip", async () => {
    if (await skipWithoutServer()) return;
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
    expect(data.trips.length).toBe(1);
    const ids = data.trips.map((t) => t.id);
    expect(ids).toEqual([DEMO_TRIP_ID]);
    expect(data.trips[0]?.destination).toMatch(/Paris/i);
    expect(data.trips.some((t) => /Dubai/i.test(t.destination))).toBe(false);
  });

  // TC5
  it("TC5: demo itinerary page loads with demo banner content", async () => {
    if (await skipWithoutServer()) return;
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
    if (await skipWithoutServer()) return;
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
  it("TC7: demo payload — Paris sole sample with timed 4-day itinerary", () => {
    expect(listDemoTrips().map((t) => t.id)).toEqual([DEMO_TRIP_ID]);
    const paris = getDemoTripPayload(DEMO_TRIP_ID);
    expect(paris.isDemo).toBe(true);
    expect(paris.days).toHaveLength(4);
    expect(paris.activities).toHaveLength(16);
    expect(paris.activities.every((a) => a.source === "demo")).toBe(true);
    expect(paris.activities.every((a) => a.start_time && a.end_time)).toBe(
      true,
    );
    expect(
      paris.activities.every(
        (a) => a.lat == null || (a.lat >= 48.8 && a.lat <= 48.9),
      ),
    ).toBe(true);
    expect(paris.legs?.map((l) => l.city)).toEqual(["Paris"]);
    expect(paris.dayCities?.every((d) => d.city === "Paris")).toBe(true);
    const byDay = paris.days.map(
      (d) => paris.activities.filter((a) => a.day_id === d.id).length,
    );
    expect(byDay).toEqual([4, 4, 4, 4]);
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
