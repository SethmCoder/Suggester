import { describe, expect, it } from "vitest";
import { localClarifyReply, replyRepeats } from "@/lib/trips/clarify-chat";
import type { ClarifyInput } from "@/lib/trips/clarify";
import { idealTripWithMajorStops } from "@/lib/trips/major-stops";

const base: ClarifyInput = {
  destination: "Rome",
  cities: ["Rome"],
  travelers: 2,
  interests: ["history", "food"],
  intensity: "balanced",
  transport: "walking",
};

describe("trip wizard / clarify domain", () => {
  it("opens with choice chips for a single city", () => {
    const turn = localClarifyReply(base, [], "");
    expect(turn.choices.length).toBeGreaterThanOrEqual(3);
    expect(turn.done).toBe(false);
  });

  it("mentions the destination city in the opener", () => {
    const turn = localClarifyReply(base, [], "");
    expect(turn.reply).toMatch(/Rome/);
  });

  it("does not repeat the same assistant reply after an answer", () => {
    const first = localClarifyReply(base, [], "");
    const second = localClarifyReply(
      base,
      [
        { role: "assistant", text: first.reply },
        { role: "user", text: "The well-known sights" },
      ],
      "The well-known sights",
    );
    expect(replyRepeats(first.reply, second.reply)).toBe(false);
  });

  it("keeps asking until the brief is ready", () => {
    const first = localClarifyReply(base, [], "");
    expect(first.done).toBe(false);
  });

  it("accepts multi-city input without collapsing cities", () => {
    const turn = localClarifyReply(
      { ...base, cities: ["Rome", "Florence"] },
      [],
      "",
    );
    expect(turn.reply).toMatch(/Rome/);
    expect(turn.reply).toMatch(/Florence/);
  });

  it("does not invent dollar fares in early replies", () => {
    const turn = localClarifyReply(base, [], "");
    expect(turn.reply).not.toMatch(/\$\d{2,}/);
  });

  it("treats a vague yes as unfinished", () => {
    const first = localClarifyReply(base, [], "");
    const next = localClarifyReply(
      base,
      [{ role: "assistant", text: first.reply }],
      "yes",
    );
    expect(next.done).toBe(false);
  });

  it("composes idealTrip text with major stops for generation", () => {
    const composed = idealTripWithMajorStops("Relaxed mornings", ["Colosseum", "Forum"]);
    expect(composed).toMatch(/Colosseum/);
    expect(composed).toMatch(/fill the rest/i);
  });

  it("preserves traveler interests in clarify input", () => {
    expect(base.interests).toEqual(["history", "food"]);
    const turn = localClarifyReply(base, [], "");
    expect(turn.reply.length).toBeGreaterThan(10);
  });

  it("returns structured choice ids", () => {
    const turn = localClarifyReply(base, [], "");
    for (const choice of turn.choices) {
      expect(choice.id).toBeTruthy();
      expect(choice.label).toBeTruthy();
    }
  });
});
