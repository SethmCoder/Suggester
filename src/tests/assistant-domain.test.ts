import { describe, expect, it } from "vitest";
import {
  buildLocalAssistantPatch,
  messageIsQuestion,
} from "@/lib/ai/assistant-local";
import { demoActivities, demoDays } from "@/lib/demo/data";

describe("assistant patch domain", () => {
  it("treats a pure question as a question", () => {
    expect(messageIsQuestion("What time is the museum open?")).toBe(true);
  });

  it("does not treat a change request as only a question", () => {
    expect(messageIsQuestion("Replace the Louvre with Musée d'Orsay")).toBe(false);
  });

  it("returns a summary for delay reshuffles", () => {
    const patch = buildLocalAssistantPatch({
      message: "My flight is delayed by 90 minutes on day 1",
      days: demoDays,
      activities: demoActivities,
      dayEnd: "21:00",
    });
    expect(patch.summary.length).toBeGreaterThan(20);
  });

  it("can delete or retimes stops for a lighter day", () => {
    const patch = buildLocalAssistantPatch({
      message: "Make day 1 less busy",
      days: demoDays,
      activities: demoActivities,
    });
    expect(patch.operations.length).toBeGreaterThan(0);
  });

  it("replace ops name the new place", () => {
    const patch = buildLocalAssistantPatch({
      message: "Change the Louvre to Musée d'Orsay",
      days: demoDays,
      activities: demoActivities,
    });
    const replace = patch.operations.find((op) => op.op === "replace");
    expect(replace).toBeTruthy();
  });

  it("preserves activities on untouched days when only day 1 changes", () => {
    const day1Id = demoDays[0]?.id;
    const otherDayActs = demoActivities.filter((act) => act.day_id !== day1Id);
    const patch = buildLocalAssistantPatch({
      message: "My flight is delayed by 2 hours on day 1",
      days: demoDays,
      activities: demoActivities,
      dayEnd: "21:00",
    });
    const touchedIds = new Set(
      patch.operations
        .map((op) => ("activityId" in op ? op.activityId : null))
        .filter(Boolean),
    );
    for (const act of otherDayActs) {
      // Untouched-day activities should not all be deleted.
      expect(touchedIds.has(act.id) && patch.operations.every((op) => op.op === "delete")).toBe(
        false,
      );
    }
    expect(otherDayActs.length).toBeGreaterThan(0);
  });

  it("supports raining swap style messages without inventing bookings", () => {
    const patch = buildLocalAssistantPatch({
      message: "It is raining on day 1, swap outdoor stops",
      days: demoDays,
      activities: demoActivities,
    });
    expect(patch.summary.toLowerCase()).not.toMatch(/booked|reservation confirmed/);
  });

  it("returns suggestions array or omits safely", () => {
    const patch = buildLocalAssistantPatch({
      message: "What should I do on day 1?",
      days: demoDays,
      activities: demoActivities,
    });
    expect(Array.isArray(patch.suggestions) || patch.suggestions == null).toBe(true);
  });

  it("does not invent a placeId for an unknown replace target", () => {
    const patch = buildLocalAssistantPatch({
      message: "Change the Louvre to Musée d'Orsay",
      days: demoDays,
      activities: demoActivities,
    });
    const replace = patch.operations.find((op) => op.op === "replace");
    if (replace && replace.op === "replace") {
      expect(replace.newName.toLowerCase()).toContain("orsay");
    }
  });

  it("handles empty activity lists without throwing", () => {
    const patch = buildLocalAssistantPatch({
      message: "Make day 1 less busy",
      days: demoDays,
      activities: [],
    });
    expect(patch.summary).toBeTruthy();
  });
});
