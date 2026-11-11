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
    expect(second.reply.toLowerCase()).toMatch(/who is traveling/);
    expect(second.choices.length).toBeGreaterThanOrEqual(3);
    expect(second.done).toBe(false);
  });

  it("asks a city-specific follow-up after learning the traveler", () => {
    const first = localClarifyReply(input, [], "");
    expect(first.reply.toLowerCase()).toMatch(/dream trip feel like/);
    const afterDream = localClarifyReply(
      input,
      [
        { role: "assistant", text: first.reply },
        { role: "user", text: "The well-known sights" },
      ],
      "The well-known sights",
    );
    expect(afterDream.reply.toLowerCase()).toMatch(/who is traveling/);
    const afterParty = localClarifyReply(
      input,
      [
        { role: "assistant", text: first.reply },
        { role: "user", text: "The well-known sights" },
        { role: "assistant", text: afterDream.reply },
        { role: "user", text: "A couple" },
        {
          role: "assistant",
          text: "How do you usually like to travel?",
        },
        { role: "user", text: "Loose plan, room to wander" },
        {
          role: "assistant",
          text: "What’s your typical energy on vacation?",
        },
        { role: "user", text: "Steady — a few good things a day" },
        {
          role: "assistant",
          text: "What do you most want to feel on this trip?",
        },
        { role: "user", text: "Inspired and curious" },
        {
          role: "assistant",
          text: "Any hard deal-breakers I should respect?",
        },
        { role: "user", text: "No hard deal-breakers" },
      ],
      "No hard deal-breakers",
    );
    expect(afterParty.reply.toLowerCase()).toMatch(
      /temples and landmarks|neighborhoods and food/,
    );
    expect(afterParty.choices.length).toBeGreaterThanOrEqual(3);
  });

  it("asks who is traveling right after the dream vibe", () => {
    const history = [
      { role: "assistant" as const, text: "What should a dream trip feel like for you?" },
      { role: "user" as const, text: "The well-known sights" },
    ];
    const turn = localClarifyReply(input, history, "The well-known sights");
    expect(turn.reply.toLowerCase()).toMatch(/who is traveling/);
    expect(turn.choices.map((choice) => choice.label)).toContain("Family with children");
    expect(turn.done).toBe(false);
  });

  it("asks traveler style, energy, and feeling before logistics", () => {
    const history = [
      { role: "assistant" as const, text: "What should a dream trip feel like for you?" },
      { role: "user" as const, text: "The well-known sights" },
      { role: "assistant" as const, text: "Who is traveling?" },
      { role: "user" as const, text: "A couple" },
    ];
    const style = localClarifyReply(input, history, "A couple");
    expect(style.reply.toLowerCase()).toMatch(/how do you usually like to travel/);
    const energy = localClarifyReply(
      input,
      [
        ...history,
        { role: "assistant", text: style.reply },
        { role: "user", text: "Loose plan, room to wander" },
      ],
      "Loose plan, room to wander",
    );
    expect(energy.reply.toLowerCase()).toMatch(/energy on vacation/);
    const feel = localClarifyReply(
      input,
      [
        ...history,
        { role: "assistant", text: style.reply },
        { role: "user", text: "Loose plan, room to wander" },
        { role: "assistant", text: energy.reply },
        { role: "user", text: "Steady — a few good things a day" },
      ],
      "Steady — a few good things a day",
    );
    expect(feel.reply.toLowerCase()).toMatch(/most want to feel/);
  });

  it("asks Seattle travelers about aviation after traveler questions", () => {
    const seattle: ClarifyInput = {
      ...input,
      destination: "Seattle",
      cities: ["Seattle"],
    };
    const opening = localClarifyReply(seattle, [], "");
    const history = [
      { role: "assistant" as const, text: opening.reply },
      { role: "user" as const, text: "A mix of walking, food, and highlights" },
      { role: "assistant" as const, text: "Who is traveling?" },
      { role: "user" as const, text: "A couple" },
      {
        role: "assistant" as const,
        text: "How do you usually like to travel?",
      },
      { role: "user" as const, text: "Loose plan, room to wander" },
      {
        role: "assistant" as const,
        text: "What’s your typical energy on vacation?",
      },
      { role: "user" as const, text: "Steady — a few good things a day" },
      {
        role: "assistant" as const,
        text: "What do you most want to feel on this trip?",
      },
      { role: "user" as const, text: "Inspired and curious" },
      {
        role: "assistant" as const,
        text: "Any hard deal-breakers I should respect?",
      },
      { role: "user" as const, text: "No hard deal-breakers" },
    ];
    const next = localClarifyReply(
      seattle,
      history,
      "No hard deal-breakers",
    );
    expect(next.reply.toLowerCase()).toMatch(/aviation/);
    expect(next.choices.some((choice) => /aviation/i.test(choice.label))).toBe(
      true,
    );
  });

  it("asks hotel questions one city at a time on multi-city trips", () => {
    const multi: ClarifyInput = {
      ...input,
      destination: "Tokyo",
      cities: ["Tokyo", "Izu", "Sendai", "Chiba"],
      interests: ["food"],
    };
    const coveredHistory = [
      {
        role: "assistant" as const,
        text: "For Tokyo → Izu → Sendai → Chiba, what should a dream trip feel like?",
      },
      { role: "user" as const, text: "A mix of walking, food, and highlights" },
      { role: "assistant" as const, text: "Who is traveling?" },
      { role: "user" as const, text: "Family with kids" },
      {
        role: "assistant" as const,
        text: "How do you usually like to travel?",
      },
      { role: "user" as const, text: "Loose plan, room to wander" },
      {
        role: "assistant" as const,
        text: "What’s your typical energy on vacation?",
      },
      { role: "user" as const, text: "Steady — a few good things a day" },
      {
        role: "assistant" as const,
        text: "What do you most want to feel on this trip?",
      },
      { role: "user" as const, text: "Connected to local life" },
      {
        role: "assistant" as const,
        text: "Any hard deal-breakers I should respect?",
      },
      { role: "user" as const, text: "No hard deal-breakers" },
      {
        role: "assistant" as const,
        text: "For Tokyo, should days lean toward classic temples and landmarks, or quieter neighborhoods and food streets?",
      },
      { role: "user" as const, text: "Neighborhoods and food" },
      {
        role: "assistant" as const,
        text: "Which part of the trip should carry that — Tokyo or Izu or Sendai?",
      },
      { role: "user" as const, text: "Split it across every city" },
      { role: "assistant" as const, text: "How full should the days feel?" },
      { role: "user" as const, text: "Balanced" },
      {
        role: "assistant" as const,
        text: "How long a walk between stops is comfortable?",
      },
      { role: "user" as const, text: "About 30 minutes is fine" },
      {
        role: "assistant" as const,
        text: "Do you lean indoors or outdoors when the weather is flexible?",
      },
      { role: "user" as const, text: "Either is fine" },
      { role: "assistant" as const, text: "How much is set aside for the whole trip?" },
      { role: "user" as const, text: "$500 to $1,500" },
      { role: "assistant" as const, text: "How should that money be used?" },
      { role: "user" as const, text: "Mostly free" },
      {
        role: "assistant" as const,
        text: "What kind of restaurants should the days lean toward?",
      },
      { role: "user" as const, text: "Street food" },
    ];
    const first = localClarifyReply(
      multi,
      coveredHistory,
      "family; interests in food; balanced pace",
    );
    expect(first.reply.toLowerCase()).toMatch(/hotel booked in tokyo/);
    expect(first.reply.toLowerCase()).not.toMatch(/hotel booked in tokyo and izu/);
    expect(first.reply.toLowerCase()).not.toMatch(/sendai and chiba/);

    const afterSuggest = localClarifyReply(
      multi,
      [
        ...coveredHistory,
        { role: "assistant", text: first.reply },
        { role: "user", text: "Suggest a hotel in Tokyo" },
      ],
      "Suggest a hotel in Tokyo",
    );
    expect(afterSuggest.reply.toLowerCase()).toMatch(/hotel area in tokyo/);
    expect(afterSuggest.reply.toLowerCase()).not.toMatch(/hotel booked in izu/);
    expect(afterSuggest.choices.map((c) => c.label.toLowerCase())).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/tokyo center/),
        expect.stringMatching(/near tokyo transit/),
      ]),
    );

    const afterArea = localClarifyReply(
      multi,
      [
        ...coveredHistory,
        { role: "assistant", text: first.reply },
        { role: "user", text: "Suggest a hotel in Tokyo" },
        { role: "assistant", text: afterSuggest.reply },
        { role: "user", text: "Tokyo center" },
      ],
      "Tokyo center",
    );
    expect(afterArea.reply.toLowerCase()).toMatch(/hotel booked in izu/);

    const afterBooked = localClarifyReply(
      multi,
      [
        ...coveredHistory,
        { role: "assistant", text: first.reply },
        { role: "user", text: "Hotel booked in Tokyo" },
      ],
      "Hotel booked in Tokyo",
    );
    expect(afterBooked.reply.toLowerCase()).toMatch(
      /hotel name or address in tokyo/,
    );
    expect(afterBooked.reply.toLowerCase()).not.toMatch(/hotel booked in izu/);
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
