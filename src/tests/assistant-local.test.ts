import { describe, expect, it } from "vitest";
import { buildLocalAssistantPatch } from "@/lib/ai/assistant-local";
import { demoActivities, demoDays } from "@/lib/demo/data";

describe("local itinerary maker assistant", () => {
  it("reshuffles day 1 for a flight delay instead of only shifting", () => {
    const patch = buildLocalAssistantPatch({
      message: "My flight is delayed by 2 hours on day 1",
      days: demoDays,
      activities: demoActivities,
      dayEnd: "21:00",
    });
    const ops = patch.operations.map((o) => o.op);
    expect(ops.includes("update") || ops.includes("set_travel") || ops.includes("delete")).toBe(
      true,
    );
    // Should not be a lone blind shift_day
    expect(ops.filter((o) => o === "shift_day").length).toBe(0);
    expect(patch.summary.toLowerCase()).toMatch(/reshuffl|delay|retim/);
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
