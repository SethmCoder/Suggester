import type { ClarifyInput } from "@/lib/trips/clarify";
import { budgetTopicAsked } from "@/lib/trips/budget";

export type ChatLine = { role: "user" | "assistant"; text: string };

export type ClarifyChoice = { id: string; label: string };

export type ClarifyTurn = {
  reply: string;
  done: boolean;
  choices: ClarifyChoice[];
};

const DREAM_MARK = "closest to the days you want";
const WHERE_MARK = "which part of the trip should carry that";
const PACE_MARK = "how full should the days feel";
const PARTY_MARK = "who is traveling";
const WALK_MARK = "how long a walk between stops";
const SETTING_MARK = "indoors or outdoors";
const LEAD_MARK = "which interest should lead";

/** Used only when the model is down or repeats itself. Each step is a different choice. */
export function localClarifyReply(
  input: ClarifyInput,
  history: ChatLine[],
  message: string,
): ClarifyTurn {
  const cities = tripCities(input);
  const place = cities.length ? cities.join(" and ") : "this trip";
  const trimmed = message.trim();
  const heard = acknowledge(trimmed);

  if (!asked(history, DREAM_MARK)) {
    return {
      reply: cities.length
        ? `${heard}This trip covers ${cities.join(" and ")}. Which of these is closest to the days you want?`
        : `${heard}Which of these is closest to the days you want?`,
      done: false,
      choices: [
        { id: "small", label: "Small local places, not big restaurants" },
        { id: "sights", label: "The well-known sights" },
        { id: "value", label: "Fun days that do not waste money" },
        { id: "mix", label: "A mix of walking, food, and a few highlights" },
      ],
    };
  }

  if (
    asked(history, PACE_MARK) &&
    asked(history, PARTY_MARK) &&
    asked(history, WALK_MARK) &&
    asked(history, SETTING_MARK) &&
    (input.interests.length < 2 || asked(history, LEAD_MARK)) &&
    budgetTopicAsked(history, "total") &&
    budgetTopicAsked(history, "split") &&
    budgetTopicAsked(history, "food")
  ) {
    return {
      reply: `I have enough to shape ${place}. Add anything you want kept in the days, or generate when the brief looks right.`,
      done: true,
      choices: [],
    };
  }

  if (cities.length > 1 && !asked(history, WHERE_MARK)) {
    return {
      reply: `${heard}Which part of the trip should carry that — ${cities.join(" or ")}?`,
      done: false,
      choices: [
        ...cities.slice(0, 3).map((city, index) => ({
          id: `city-${index}`,
          label: `Mostly ${city}`,
        })),
        { id: "split", label: "Split it across every city" },
      ],
    };
  }

  if (!budgetTopicAsked(history, "total")) {
    return {
      reply: `${heard}How much is set aside for the whole trip?`,
      done: false,
      choices: [
        { id: "under-500", label: "Under $500" },
        { id: "mid", label: "$500 to $1,500" },
        { id: "high", label: "$1,500 to $3,000" },
        { id: "open", label: "More than $3,000" },
      ],
    };
  }

  if (!budgetTopicAsked(history, "split")) {
    return {
      reply: `${heard}How should that money be used?`,
      done: false,
      choices: [
        { id: "sights", label: "Mostly sights" },
        { id: "food", label: "Mostly food" },
        { id: "transit", label: "Mostly getting around" },
        { id: "free", label: "Mostly free" },
      ],
    };
  }

  if (!budgetTopicAsked(history, "food")) {
    return {
      reply: `${heard}What kind of restaurants should the days lean toward?`,
      done: false,
      choices: [
        { id: "street", label: "Street food and casual counters" },
        { id: "casual", label: "Casual sit-down" },
        { id: "nicer", label: "One nicer meal" },
        { id: "mix", label: "A mix" },
      ],
    };
  }

  if (!asked(history, PARTY_MARK)) {
    return {
      reply: `${heard}Who is traveling?`,
      done: false,
      choices: [
        { id: "solo", label: "Solo" },
        { id: "couple", label: "A couple" },
        { id: "family", label: "Family with children" },
        { id: "multi", label: "Multigenerational" },
        { id: "friends", label: "Friends" },
        { id: "business", label: "Business" },
      ],
    };
  }

  if (!asked(history, WALK_MARK)) {
    return {
      reply: `${heard}How long a walk between stops feels comfortable?`,
      done: false,
      choices: [
        { id: "short", label: "Under 15 minutes" },
        { id: "medium", label: "About 30 minutes" },
        { id: "open", label: "As far as the route needs" },
      ],
    };
  }

  if (!asked(history, SETTING_MARK)) {
    return {
      reply: `${heard}Should the days lean indoors or outdoors?`,
      done: false,
      choices: [
        { id: "indoor", label: "Mostly indoors" },
        { id: "outdoor", label: "Mostly outdoors" },
        { id: "either", label: "Either indoors or outdoors" },
      ],
    };
  }

  if (input.interests.length > 1 && !asked(history, LEAD_MARK)) {
    return {
      reply: `${heard}Which interest should lead the days?`,
      done: false,
      choices: [
        ...input.interests.slice(0, 3).map((interest) => ({ id: interest, label: interest })),
        { id: "equal", label: "Keep them equal" },
      ],
    };
  }

  if (!asked(history, PACE_MARK)) {
    return {
      reply: `${heard}How full should the days feel in ${place}?`,
      done: false,
      choices: [
        { id: "easy", label: "One or two things, then free time" },
        { id: "steady", label: "A steady day with room to wander" },
        { id: "full", label: "A full day, as long as it stays worthwhile" },
      ],
    };
  }

  return {
    reply: `I have enough to shape ${place}. Add anything you want kept in the days, or generate when the brief looks right.`,
    done: true,
    choices: [],
  };
}

export function replyIgnoresTraveler(_message: string, reply: string): boolean {
  return reply.trim().length < 8;
}

export function replyRepeats(previous: string | undefined, next: string): boolean {
  if (!previous?.trim()) return false;
  const a = normalize(previous);
  const b = normalize(next);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aQuestion = a.split("?").at(-2) ?? a;
  const bQuestion = b.split("?").at(-2) ?? b;
  return aQuestion.trim().slice(-90) === bQuestion.trim().slice(-90);
}

export function tripCities(input: ClarifyInput): string[] {
  const named = [input.destination ?? "", ...(input.cities ?? [])]
    .map((city) => city.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const city of named) {
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(city);
  }
  return cities;
}

function asked(history: ChatLine[], marker: string): boolean {
  const needle = marker.toLowerCase();
  return history.some(
    (line) => line.role === "assistant" && line.text.toLowerCase().includes(needle),
  );
}

function acknowledge(message: string): string {
  if (!message) return "";
  if (/small|not large|local place|restaurant/i.test(message)) {
    return "Small places, and not big restaurants. ";
  }
  if (/money|waste|cheap|budget|worth/i.test(message)) {
    return "Fun, without wasting money. ";
  }
  if (/sight|famous|highlight/i.test(message)) {
    return "The well-known sights. ";
  }
  return "I'll use that. ";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
