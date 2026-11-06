import { describe, expect, it } from "vitest";
import { localClarifyReply } from "@/lib/trips/clarify-chat";
import type { ClarifyInput } from "@/lib/trips/clarify";

const input: ClarifyInput = {
  destination: "Paris",
  travelers: 2,
  interests: ["food"],
  intensity: "balanced",
  transport: "walking",
};

const opening = {
  role: "assistant" as const,
  text: "Who is traveling with you, and does anyone need a slower pace?",
};

describe("clarify conversation", () => {
  it("follows up when the traveler mentions children", () => {
    const turn = localClarifyReply(
      input,
      [opening],
      "My sister and her two kids",
    );
    expect(turn.reply.toLowerCase()).toMatch(/old|children|walk/);
    expect(turn.reply.toLowerCase()).not.toMatch(/how do you want to spend/);
    expect(turn.done).toBe(false);
  });

  it("does not accept a bare yes as the companion answer", () => {
    const turn = localClarifyReply(input, [opening], "yes");
    expect(turn.reply.toLowerCase()).toMatch(/who is actually coming/);
  });

  it("answers a request for examples instead of the next intake question", () => {
    const turn = localClarifyReply(
      input,
      [],
      "Can you give me some examples of a good trip?",
    );
    expect(turn.reply.toLowerCase()).toMatch(/three shapes/);
    expect(turn.reply.toLowerCase()).not.toMatch(/who is traveling/);
    expect(turn.reply).not.toMatch(/\$\d/);
  });
});
