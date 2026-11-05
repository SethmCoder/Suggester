import { describe, expect, it } from "vitest";
import { offlineSnapshotFromGenerated } from "@/lib/trips/offline-from-generated";

describe("offline snapshot from a generated itinerary", () => {
  it("keeps each activity on its day", () => {
    const snap = offlineSnapshotFromGenerated({
      tripId: "offline-test",
      destination: "Lisbon",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      days: [
        {
          dayIndex: 0,
          activities: [
            {
              placeId: "osm:node:1",
              name: "Belém Tower",
              lat: 38.69,
              lng: -9.21,
              startTime: "10:00",
              durationMinutes: 60,
              priority: "must_see",
              hoursVerified: false,
            },
          ],
        },
      ],
      legs: [{ city: "Lisbon", days: 1 }],
    });
    expect(snap.trip.id).toBe("offline-test");
    expect(snap.days).toHaveLength(1);
    expect(snap.activities[0]?.day_id).toBe("offline-test-day-0");
    expect(snap.activities[0]?.start_time).toBe("10:00:00");
    expect(snap.activities[0]?.end_time).toBe("11:00:00");
    expect(snap.offlineOnly).toBe(true);
  });
});
