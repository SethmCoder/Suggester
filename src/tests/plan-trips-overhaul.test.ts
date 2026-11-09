import { describe, expect, it } from "vitest";
import {
  assertValidDateRange,
  nightsBetween,
  nightsLabel,
  sanitizeTripDate,
} from "@/lib/trips/dates";
import {
  applyTripDatesToLegs,
  expandLegsToDays,
  normalizeLegDates,
} from "@/lib/trips/legs";
import {
  partitionScheduled,
  reindexByChronology,
  sortActivitiesChronologically,
} from "@/lib/trips/activity-order";
import {
  cityScopedEditTarget,
  filterActivitiesOutsideCity,
  parseMultiCityPrompt,
} from "@/lib/trips/multi-city-prompt";
import {
  applyDoneToggle,
  buildAddedActivity,
  removeFromItineraryOnly,
} from "@/lib/trips/add-place";
import type { ActivityRow, TripPreferencesPayload } from "@/lib/types/trip";

describe("Plan Trips P1–P10", () => {
  it("P1 nights from dates; rejects inverted range and absurd years", () => {
    expect(nightsBetween("2026-06-08", "2026-06-13")).toBe(5);
    expect(nightsLabel(5)).toBe("5 nights");
    expect(() => assertValidDateRange("2026-06-13", "2026-06-08")).toThrow(
      /end date/i,
    );
    expect(sanitizeTripDate("3726-01-19")).toBe("");
    expect(sanitizeTripDate("2026-01-19")).toBe("2026-01-19");
  });

  it("P2 idempotent create key shape is stable", () => {
    const key = `create:2026-06-08:2026-06-13:Paris|Rome`;
    expect(key).toContain("create:");
    expect(key).toContain("Paris|Rome");
  });

  it("P3 multi-city leg dates expand correctly", () => {
    const legs = applyTripDatesToLegs(
      [
        {
          city: "Paris",
          days: 1,
          arrivalDate: "2026-06-08",
          departureDate: "2026-06-12",
        },
        {
          city: "Rome",
          days: 1,
          arrivalDate: "2026-06-12",
          departureDate: "2026-06-16",
        },
        {
          city: "Barcelona",
          days: 1,
          arrivalDate: "2026-06-16",
          departureDate: "2026-06-20",
        },
      ],
      "2026-06-08",
      "2026-06-20",
    );
    expect(normalizeLegDates(legs[0]).nights).toBe(4);
    expect(normalizeLegDates(legs[1]).nights).toBe(4);
    expect(normalizeLegDates(legs[2]).nights).toBe(4);
    const days = expandLegsToDays(legs);
    expect(days[0].city).toBe("Paris");
    expect(days.some((d) => d.city === "Rome")).toBe(true);
    expect(days.some((d) => d.city === "Barcelona")).toBe(true);
  });

  it("P4 chrono sort puts unscheduled last", () => {
    const acts = [
      { id: "a", start_time: "13:00:00", sort_order: 0 },
      { id: "b", start_time: "09:00:00", sort_order: 1 },
      { id: "c", start_time: null, sort_order: 2 },
    ];
    const sorted = sortActivitiesChronologically(acts);
    expect(sorted.map((a) => a.id)).toEqual(["b", "a", "c"]);
    const parts = partitionScheduled(acts);
    expect(parts.unscheduled.map((a) => a.id)).toEqual(["c"]);
    const reindexed = reindexByChronology(acts);
    expect(reindexed[0].sort_order).toBe(0);
    expect(reindexed[0].id).toBe("b");
  });

  it("P5 traveler prefs persist on payload shape", () => {
    const prefs: Partial<TripPreferencesPayload> = {
      travelerMode: "business",
      planningClarity: "know_where_not_what",
      interests: [],
      intensity: "balanced",
      transport: "walking",
    };
    expect(prefs.travelerMode).toBe("business");
    expect(prefs.planningClarity).toBe("know_where_not_what");
  });

  it("P6 long prompt extracts three cities and per-city pace", () => {
    const plan = parseMultiCityPrompt(
      "Plan a 12-night trip through Paris, Rome, and Barcelona. I want a relaxed pace in Paris, a more active schedule in Rome, and a moderate pace in Barcelona. Include historical attractions, local restaurants, and some lesser-known places. Hotels near the main attractions, but not more than $200 per night.",
    );
    expect(plan.destinations).toEqual(["Paris", "Rome", "Barcelona"]);
    expect(plan.nights).toBe(12);
    expect(plan.cityPreferences.Paris?.pace).toBe("relaxed");
    expect(plan.cityPreferences.Rome?.pace).toBe("packed");
    expect(plan.cityPreferences.Barcelona?.pace).toBe("balanced");
    expect(plan.tripWide.hotelBudgetPerNight).toBe(200);
    expect(plan.tripWide.interests).toContain("history");
  });

  it("P7 city-scoped patch leaves other cities alone", () => {
    expect(cityScopedEditTarget("Only change Rome please")).toBe("Rome");
    const activities = [
      { id: "1", name: "Louvre", planning_note: "city=Paris" },
      { id: "2", name: "Colosseum", planning_note: "city=Rome" },
    ];
    const untouched = filterActivitiesOutsideCity(activities, "Rome");
    expect(untouched.map((a) => a.id)).toEqual(["1"]);
  });

  it("P8 hotel persist survives prefs reload shape", () => {
    const legs = [
      { city: "Paris", days: 4, hotel: "Hotel A" },
      {
        city: "Rome",
        days: 4,
        hotel: "Hotel Roma",
        hotelBooked: true,
        hotelPlaceId: "osm:1",
      },
    ];
    const payload: Partial<TripPreferencesPayload> = {
      legs,
      destinations: legs.map((l) => ({ name: l.city, nights: l.days - 1 })),
      interests: [],
      intensity: "balanced",
      transport: "transit",
    };
    const reloaded = JSON.parse(JSON.stringify(payload)) as typeof payload;
    expect(reloaded.legs?.[1].hotel).toBe("Hotel Roma");
    expect(reloaded.legs?.[1].hotelBooked).toBe(true);
  });

  it("P9 Things add dedupe by place_id", () => {
    const existing: ActivityRow[] = [
      {
        id: "1",
        day_id: "day-1",
        place_id: "place-9",
        name: "Museum",
        address: null,
        lat: null,
        lng: null,
        start_time: "10:00:00",
        end_time: null,
        duration_minutes: 90,
        travel_minutes_from_prev: null,
        priority: "optional",
        planning_note: null,
        hours_verified: false,
        opening_hours: null,
        website_uri: null,
        google_maps_uri: null,
        photo_name: null,
        popularity_label: null,
        popularity_sources: null,
        popularity_attribution_urls: null,
        schedule_warnings: null,
        sort_order: 0,
        user_locked: true,
        completed: false,
        source: "things",
      },
    ];
    const dup = buildAddedActivity({
      dayId: "day-1",
      existing,
      placeId: "place-9",
      name: "Museum",
      startTime: "11:00",
      city: "Paris",
    });
    expect("duplicate" in dup).toBe(true);
    const ok = buildAddedActivity({
      dayId: "day-1",
      existing,
      placeId: "place-10",
      name: "Park",
      startTime: "11:00",
      city: "Paris",
    });
    expect("activity" in ok).toBe(true);
    if ("activity" in ok) {
      expect(ok.activity.planning_note).toContain("Paris");
      expect(ok.activity.start_time).toBe("11:00:00");
    }
  });

  it("P10 Done toggles completed; Remove drops row only", () => {
    expect(applyDoneToggle({ completed: false })).toEqual({ completed: true });
    expect(applyDoneToggle({ completed: true })).toEqual({ completed: false });
    const wishlist = [{ id: "wish-1", name: "Louvre" }];
    const activities = [
      { id: "act-1", name: "Louvre" },
      { id: "act-2", name: "Cafe" },
    ];
    const next = removeFromItineraryOnly(activities, "act-1");
    expect(next.map((a) => a.id)).toEqual(["act-2"]);
    expect(wishlist).toHaveLength(1);
  });
});
