import { describe, expect, it } from "vitest";
import { buildLocalAssistantPatch } from "@/lib/ai/assistant-local";
import { demoActivities, demoDays } from "@/lib/demo/data";

describe("local itinerary maker assistant", () => {
  it("shifts day 1 for a flight delay", () => {
    const patch = buildLocalAssistantPatch({
      message: "My flight is delayed by 2 hours on day 1",
      days: demoDays,
      activities: demoActivities,
    });
    expect(patch.operations[0]?.op).toBe("shift_day");
    if (patch.operations[0]?.op === "shift_day") {
      expect(patch.operations[0].shiftMinutes).toBe(120);
      expect(patch.operations[0].dayIndex).toBe(0);
    }
  });

  it("replaces a named place", () => {
    const patch = buildLocalAssistantPatch({
      message: "Change the Louvre to Musée d'Orsay",
      days: demoDays,
      activities: demoActivities,
    });
    expect(patch.operations[0]?.op).toBe("replace");
    if (patch.operations[0]?.op === "replace") {
      expect(patch.operations[0].newName.toLowerCase()).toContain("orsay");
    }
  });
});
