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

describe("clarify conversation", () => {
  it("opens with the destination instead of a fixed intake list", () => {
    const turn = localClarifyReply(input, [], "");
    expect(turn.reply).toMatch(/Paris/);
    expect(turn.reply.toLowerCase()).not.toMatch(/hotel|how do you want to spend/);
    expect(turn.done).toBe(false);
  });

  it("keeps an open question when the traveler mentions children", () => {
    const turn = localClarifyReply(input, [], "My sister and her two kids");
    expect(turn.reply.toLowerCase()).toMatch(/paris|dream/);
    expect(turn.reply.toLowerCase()).not.toMatch(/how do you want to spend|already booked a hotel/);
    expect(turn.done).toBe(false);
  });

  it("does not treat a short reply as a finished brief", () => {
    const turn = localClarifyReply(input, [], "yes");
    expect(turn.done).toBe(false);
    expect(turn.reply.toLowerCase()).not.toMatch(/\$\d/);
  });
});
