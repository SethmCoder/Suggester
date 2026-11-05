import { describe, expect, it } from "vitest";
import { fallbackClarifyQuestions } from "@/lib/trips/clarify";

describe("fallback clarify questions", () => {
  it("asks about food and pace gaps and skips filled dietary notes", () => {
    const questions = fallbackClarifyQuestions({
      destination: "Dubai → Abu Dhabi",
      travelers: 2,
      interests: ["food", "architecture"],
      dietary: "vegetarian",
      cities: ["Dubai", "Abu Dhabi"],
      intensity: "balanced",
    });
    expect(questions.map((q) => q.id)).not.toContain("food");
    expect(questions.some((q) => q.id === "party")).toBe(true);
    expect(questions.some((q) => q.id === "city-pace")).toBe(true);
    expect(questions.length).toBeLessThanOrEqual(5);
  });
});
