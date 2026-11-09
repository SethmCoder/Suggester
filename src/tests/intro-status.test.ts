import { describe, expect, it } from "vitest";
import {
  isIntroComplete,
  markIntroComplete,
  normalizeTravelerProfile,
} from "@/lib/profile/intro-status";

describe("intro status for returning accounts", () => {
  it("treats completed profiles as done", () => {
    expect(isIntroComplete({ completed: true, answers: [] })).toBe(true);
  });

  it("treats profiles with age or answers as done even if completed flag missing", () => {
    expect(
      isIntroComplete({
        completed: false,
        age: "25–34",
        answers: [],
      }),
    ).toBe(true);
    expect(
      isIntroComplete({
        completed: false,
        answers: [
          { question: "age?", answer: "25–34" },
          { question: "dream?", answer: "slow days" },
        ],
      }),
    ).toBe(true);
  });

  it("treats travel intelligence as evidence of a returning account", () => {
    expect(
      isIntroComplete(
        normalizeTravelerProfile({
          completed: false,
          travelIntelligence: { interests: ["food"] },
        }),
      ),
    ).toBe(true);
  });

  it("marks incomplete profiles complete for persistence", () => {
    expect(markIntroComplete({ completed: false, answers: [] }).completed).toBe(
      true,
    );
  });
});
