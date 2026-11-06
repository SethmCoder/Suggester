import type { ClarifyInput } from "@/lib/trips/clarify";

export type ChatLine = { role: "user" | "assistant"; text: string };

const ASKING =
  /(\?|(^|\b)(can you|could you|would you|please|what|how|why|show me|give me)\b)/i;
const WANTS_EXAMPLES =
  /\b(example|examples|ideas?|suggest|what would|show me|for instance|look like|good trip)\b/i;
const KIDS = /\b(kid|kids|child|children|son|daughter|baby|toddler|infant)\b/i;
const COMPANIONS =
  /\b(sister|brother|partner|wife|husband|boyfriend|girlfriend|friend|friends|mom|dad|mother|father|parent|parents|family|colleague)\b/i;
const VAGUE = /^(yes|yeah|yep|no|nope|maybe|sure|ok|okay|idk|i don't know)\.?$/i;

export function localClarifyReply(
  input: ClarifyInput,
  history: ChatLine[],
  message: string,
): { reply: string; done: boolean } {
  const trimmed = message.trim();
  const lastAssistant =
    [...history].reverse().find((line) => line.role === "assistant")?.text ?? "";
  const userTurns =
    history.filter((line) => line.role === "user").length + (trimmed ? 1 : 0);

  if (!trimmed) {
    const place = input.destination?.trim();
    return {
      reply: place
        ? `I'm planning ${place} with you, and I want the days to feel like yours. ${openingQuestion(input)}`
        : "Tell me the city and I'll start shaping the days around it.",
      done: false,
    };
  }

  if (WANTS_EXAMPLES.test(trimmed) || (ASKING.test(trimmed) && WANTS_EXAMPLES.test(trimmed))) {
    return { reply: exampleReply(input), done: false };
  }

  if (ASKING.test(trimmed) && !looksLikeAnswer(trimmed, lastAssistant)) {
    return {
      reply: `${answerAside(trimmed, input)} ${openingQuestion(input)}`,
      done: false,
    };
  }

  if (isCompanionThread(lastAssistant)) {
    if (KIDS.test(trimmed)) {
      return {
        reply:
          "Children change how full a day should be. How old are they, and should the days include a rest or a shorter walk?",
        done: false,
      };
    }
    if (COMPANIONS.test(trimmed)) {
      return {
        reply:
          "I'll plan the days around that group. Does anyone need a slower pace, step-free routes, or an earlier evening?",
        done: false,
      };
    }
    if (VAGUE.test(trimmed)) {
      return {
        reply:
          "I need who is actually coming. Are you going alone, with a partner, with friends, or with children?",
        done: false,
      };
    }
    if (/\b(solo|alone|just me|by myself)\b/i.test(trimmed)) {
      return {
        reply:
          "Solo it is. Do you want the days to stay flexible, or a set plan you can follow without deciding on the spot?",
        done: false,
      };
    }
  }

  if (userTurns >= 4) {
    return {
      reply:
        "The brief is ready to generate. Tell me anything else you want protected, or generate when it looks right.",
      done: true,
    };
  }

  return {
    reply: nextGap(input, history, trimmed),
    done: false,
  };
}

function openingQuestion(input: ClarifyInput): string {
  if ((input.travelers ?? 1) > 1) {
    return "Who is traveling with you, and does anyone need a slower pace?";
  }
  return "Are you traveling alone, or should the days leave room for someone else?";
}

function isCompanionThread(lastAssistant: string): boolean {
  return /who is traveling|someone else|traveling alone|coming with/i.test(
    lastAssistant,
  );
}

function looksLikeAnswer(message: string, lastAssistant: string): boolean {
  if (!lastAssistant) return false;
  if (WANTS_EXAMPLES.test(message)) return false;
  return message.length > 12 && !message.trim().endsWith("?");
}

function exampleReply(input: ClarifyInput): string {
  const place = input.destination?.trim() || "this trip";
  const interest = input.interests[0] || "one thing you care about";
  return `Here are three shapes for ${place}. These are day patterns, not bookings or prices. One: a slow morning, a walk in a single neighborhood, and one long stop tied to ${interest}. Two: two short stops with a sit-down meal between them and the evening left open. Three: one main sight in the morning and the rest of the day unscheduled. Which of those feels right, or what would you change?`;
}

function answerAside(message: string, input: ClarifyInput): string {
  const place = input.destination?.trim() || "the trip";
  if (WANTS_EXAMPLES.test(message)) return exampleReply(input);
  return `I can talk that through for ${place} using only what you have entered so far. I will not invent hotels, fares, or opening hours.`;
}

function nextGap(input: ClarifyInput, history: ChatLine[], latest: string): string {
  const said = `${history.map((line) => line.text).join(" ")} ${latest}`.toLowerCase();
  if (!/hotel|booked|brand|marriott|hilton|hyatt|westin/i.test(said)) {
    return "Have you already booked a hotel? If not, tell me a brand you like and I'll put real matches in the brief for you to pick.";
  }
  if (!input.dietary?.trim() && !/food|eat|meal|vegetarian|vegan|allerg/i.test(said)) {
    return "Any foods you want to skip, or meals you do not want the days built around?";
  }
  if (!input.budget && !/free|paid|splurge|budget|spend/i.test(said)) {
    return "How do you want to spend: mostly free sights, a few paid tickets, or a splurge meal?";
  }
  return "What would make one of these days feel like yours, rather than a generic list of sights?";
}

export function replyIgnoresTraveler(message: string, reply: string): boolean {
  if (!message.trim()) return false;
  if (
    WANTS_EXAMPLES.test(message) &&
    !/\b(shape|shapes|example|morning|evening|neighborhood|unscheduled)\b/i.test(reply)
  ) {
    return true;
  }
  if (KIDS.test(message) && !/\b(child|children|kid|age|old|walk|rest|nap)\b/i.test(reply)) {
    return true;
  }
  if (COMPANIONS.test(message) && /\bhow do you want to spend\b/i.test(reply)) {
    return true;
  }
  return false;
}
