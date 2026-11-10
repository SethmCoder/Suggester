import { describe, expect, it } from "vitest";
import {
  isFreeformRequest,
  localClarifyReply,
  replyRepeats,
} from "@/lib/trips/clarify-chat";
import type { ClarifyInput } from "@/lib/trips/clarify";
import { localIntroFollowUp, profileFromIntro, scriptedIntroTurn } from "@/lib/profile/intro-chat";

const input: ClarifyInput = {
  destination: "Tokyo",
  cities: ["Tokyo", "Kyoto"],
  travelers: 2,
  interests: ["food"],
  intensity: "balanced",
  transport: "walking",
};

describe("clarify conversation", () => {
  it("opens with every city as a multiple choice, not one open question", () => {
    const turn = localClarifyReply(input, [], "");
    expect(turn.reply).toMatch(/Tokyo/);
    expect(turn.reply).toMatch(/Kyoto/);
    expect(turn.choices.length).toBeGreaterThanOrEqual(3);
    expect(turn.reply.toLowerCase()).not.toMatch(/what would a dream version/);
    expect(turn.done).toBe(false);
  });

  it("follows freeform requests instead of forcing the dream MCQ", () => {
    const said =
      "Please make day 1 light after we land, focus on quiet museums, and avoid tourist traps";
    expect(isFreeformRequest(said)).toBe(true);
    const turn = localClarifyReply(input, [], said);
    expect(turn.reply.toLowerCase()).not.toMatch(/closest to the days you want/);
    expect(turn.reply.toLowerCase()).toMatch(
      /who is traveling|how full|walk|indoors|outdoors|set aside|hotel|morning|evening|surprise|deal-breaker|must-have|energy|factor that|got it|i'll|noted/i,
    );
    expect(turn.done).toBe(false);
  });

  it("asks a different question after the traveler answers", () => {
    const first = localClarifyReply(input, [], "");
    const second = localClarifyReply(
      input,
      [
        { role: "assistant", text: first.reply },
        { role: "user", text: "I enjoyed some small places not large restaurants" },
      ],
      "I enjoyed some small places not large restaurants",
    );
    expect(second.reply).not.toBe(first.reply);
    expect(replyRepeats(first.reply, second.reply)).toBe(false);
    expect(second.reply.toLowerCase()).toMatch(/tokyo|kyoto/);
    expect(second.choices.length).toBeGreaterThanOrEqual(3);
    expect(second.done).toBe(false);
  });

  it("asks for the trip total after the city choice", () => {
    const first = localClarifyReply(input, [], "");
    const second = localClarifyReply(
      input,
      [
        { role: "assistant", text: first.reply },
        { role: "user", text: "The well-known sights" },
      ],
      "The well-known sights",
    );
    const third = localClarifyReply(
      input,
      [
        { role: "assistant", text: first.reply },
        { role: "user", text: "The well-known sights" },
        { role: "assistant", text: second.reply },
        { role: "user", text: "Split it across every city" },
      ],
      "Split it across every city",
    );
    expect(third.reply.toLowerCase()).toMatch(/how much is set aside/);
    expect(third.choices.map((choice) => choice.label)).toContain("Under $500");
    expect(third.done).toBe(false);
  });

  it("asks who is traveling after the budget questions", () => {
    const history = [
      { role: "assistant" as const, text: "Which of these is closest to the days you want?" },
      { role: "user" as const, text: "The well-known sights" },
      { role: "assistant" as const, text: "Which part of the trip should carry that?" },
      { role: "user" as const, text: "Split it across every city" },
      { role: "assistant" as const, text: "How much is set aside for the whole trip?" },
      { role: "user" as const, text: "Under $500" },
      { role: "assistant" as const, text: "How should that money be used?" },
      { role: "user" as const, text: "Mostly free" },
      { role: "assistant" as const, text: "What kind of restaurants should the days lean toward?" },
      { role: "user" as const, text: "Street food" },
    ];
    const turn = localClarifyReply(input, history, "Street food");
    expect(turn.reply.toLowerCase()).toMatch(/who is traveling/);
    expect(turn.choices.map((choice) => choice.label)).toContain("Family with children");
    expect(turn.done).toBe(false);
  });

  it("does not treat a short reply as a finished brief", () => {
    const first = localClarifyReply(input, [], "");
    const turn = localClarifyReply(input, [{ role: "assistant", text: first.reply }], "yes");
    expect(turn.done).toBe(false);
    expect(turn.reply.toLowerCase()).not.toMatch(/\$\d/);
  });
});

describe("new account intro", () => {
  it("starts with age, then a dream vacation choice, then a new question", () => {
    const age = scriptedIntroTurn([], "");
    expect(age?.reply.toLowerCase()).toMatch(/age/);
    expect(age?.choices.map((choice) => choice.label)).toContain("25–34");
    const dream = scriptedIntroTurn(
      [
        { role: "assistant", text: age!.reply },
        { role: "user", text: "25–34" },
      ],
      "25–34",
    );
    expect(dream?.reply.toLowerCase()).toMatch(/dream vacation/);
    expect(scriptedIntroTurn(
      [
        { role: "assistant", text: age!.reply },
        { role: "user", text: "25–34" },
        { role: "assistant", text: dream!.reply },
        { role: "user", text: "Small local places, not big restaurants" },
      ],
      "Small local places, not big restaurants",
    )).toBeNull();
    const follow = localIntroFollowUp(
      [
        { role: "assistant", text: age!.reply },
        { role: "user", text: "25–34" },
        { role: "assistant", text: dream!.reply },
      ],
      "Small local places, not big restaurants",
    );
    expect(follow.reply).not.toBe(dream?.reply);
    expect(follow.choices.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps only answers the traveler gave", () => {
    const profile = profileFromIntro(
      [
        { role: "assistant", text: "Which age range is closest to you?" },
        { role: "user", text: "35–49" },
        { role: "assistant", text: "Which of these is closest to your dream vacation?" },
      ],
      "Slow days with time to wander",
    );
    expect(profile.age).toBe("35–49");
    expect(profile.dream).toBe("Slow days with time to wander");
    expect(profile.answers).toHaveLength(2);
  });
});
