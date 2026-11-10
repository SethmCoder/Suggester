import { describe, expect, it } from "vitest";
import {
  coveredClarifyTopics,
  parseTripBrief,
} from "@/lib/trips/parse-brief";
import { localClarifyReply } from "@/lib/trips/clarify-chat";
import type { ClarifyInput } from "@/lib/trips/clarify";

describe("parseTripBrief", () => {
  it("extracts family with a child age, interests, and must-dos from a long prompt", () => {
    const brief = parseTripBrief(
      "I am traveling with a 12 year old. I like food, museums, and history. I want to do the Colosseum, Vatican Museums, and a gelato walk. Keep the pace relaxed and budget around $2000.",
    );
    expect(brief.party).toBe("family");
    expect(brief.childAges).toEqual([12]);
    expect(brief.travelers).toBeGreaterThanOrEqual(2);
    expect(brief.interests).toEqual(
      expect.arrayContaining(["food", "museums", "history"]),
    );
    expect(brief.mustSee.join(" ").toLowerCase()).toMatch(/colosseum/);
    expect(brief.intensity).toBe("relaxed");
    expect(brief.budgetTotal).toBe(2000);
    expect(brief.summary.toLowerCase()).toMatch(/12-year-old/);
  });

  it("marks covered topics so clarify can skip re-asking", () => {
    const covered = coveredClarifyTopics(
      "Traveling with my 12 year old daughter. We like museums and food. Budget is $1500. Prefer under 15 minutes walking and mostly outdoors.",
      ["museums", "food"],
    );
    expect(covered.party).toBe(true);
    expect(covered.dream).toBe(true);
    expect(covered.budgetTotal).toBe(true);
    expect(covered.walk).toBe(true);
    expect(covered.setting).toBe(true);
  });
});

describe("localClarifyReply with rich briefs", () => {
  const input: ClarifyInput = {
    destination: "Rome",
    cities: ["Rome"],
    travelers: 2,
    interests: ["food", "museums"],
    intensity: "balanced",
    transport: "walking",
  };

  it("skips party and dream when the traveler already described them", () => {
    const opening = localClarifyReply(input, [], "");
    const rich =
      "I am traveling with a 12 year old. I like food and museums. I want to do the Colosseum. Budget $2000, mostly food, street food, relaxed pace, under 15 minutes walking, mostly outdoors.";
    const next = localClarifyReply(
      input,
      [
        { role: "assistant", text: opening.reply },
        { role: "user", text: rich },
      ],
      rich,
    );
    expect(next.reply.toLowerCase()).not.toMatch(/who is traveling/);
    expect(next.reply.toLowerCase()).not.toMatch(/closest to the days you want/);
    // Still asks for something missing, or is ready.
    if (!next.done) {
      expect(next.choices.length).toBeGreaterThanOrEqual(2);
    } else {
      expect(next.reply.toLowerCase()).toMatch(/generate itinerary/);
    }
  });

  it("ends with a clear generate instruction when enough is known", () => {
    const history = [
      { role: "assistant" as const, text: "Which of these is closest to the days you want?" },
      {
        role: "user" as const,
        text: "Family with a 12 year old, food and museums, Colosseum, under $500, mostly free, street food, under 15 minutes, mostly outdoors, relaxed",
      },
      {
        role: "assistant" as const,
        text: "How much is set aside for the whole trip?",
      },
      { role: "user" as const, text: "Under $500" },
      {
        role: "assistant" as const,
        text: "How should that money be used?",
      },
      { role: "user" as const, text: "Mostly free" },
      {
        role: "assistant" as const,
        text: "What kind of restaurants should the days lean toward?",
      },
      { role: "user" as const, text: "Street food and casual counters" },
      { role: "assistant" as const, text: "Who is traveling?" },
      { role: "user" as const, text: "Family with children" },
      {
        role: "assistant" as const,
        text: "How long a walk between stops feels comfortable?",
      },
      { role: "user" as const, text: "Under 15 minutes" },
      {
        role: "assistant" as const,
        text: "Should the days lean indoors or outdoors?",
      },
      { role: "user" as const, text: "Mostly outdoors" },
      {
        role: "assistant" as const,
        text: "Which interest should lead the days?",
      },
      { role: "user" as const, text: "food" },
      {
        role: "assistant" as const,
        text: "How full should the days feel in Rome?",
      },
      { role: "user" as const, text: "One or two things, then free time" },
    ];
    const turn = localClarifyReply(
      input,
      history,
      "One or two things, then free time",
    );
    // Travel-agent mode: never dead-ends on Generate; keeps interviewing.
    expect(turn.done).toBe(false);
    expect(turn.choices.length).toBeGreaterThan(0);
    expect(turn.reply.toLowerCase()).not.toMatch(/generate itinerary/);
  });
});
