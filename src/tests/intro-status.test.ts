import { describe, expect, it } from "vitest";
import {
  isIntroComplete,
  markIntroComplete,
  normalizeTravelerProfile,
  shouldSkipIntro,
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

  it("skips intro for prior trips, dreams, wishlist, or older profiles", () => {
    expect(
      shouldSkipIntro({
        profile: { completed: false, answers: [] },
        tripCount: 1,
      }),
    ).toBe(true);
    expect(
      shouldSkipIntro({
        profile: { completed: false, answers: [] },
        futureTripCount: 2,
      }),
    ).toBe(true);
    expect(
      shouldSkipIntro({
        profile: { completed: false, answers: [] },
        wishlistCount: 1,
      }),
    ).toBe(true);
    expect(
      shouldSkipIntro({
        profile: { completed: false, answers: [] },
        profileAgeMs: 25 * 60 * 60 * 1000,
      }),
    ).toBe(true);
  });

  it("keeps intro for brand-new empty accounts", () => {
    expect(
      shouldSkipIntro({
        profile: { completed: false, answers: [] },
        tripCount: 0,
        futureTripCount: 0,
        wishlistCount: 0,
        profileAgeMs: 60_000,
      }),
    ).toBe(false);
  });
});
