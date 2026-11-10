import type { ClarifyInput } from "@/lib/trips/clarify";
import { budgetTopicAsked } from "@/lib/trips/budget";
import {
  coveredClarifyTopics,
  parseTripBrief,
} from "@/lib/trips/parse-brief";

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
  const userCorpus = [
    ...history.filter((line) => line.role === "user").map((line) => line.text),
    trimmed,
    input.idealTrip ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const covered = coveredClarifyTopics(userCorpus, input.interests);
  const brief = parseTripBrief(userCorpus);
  const heard = acknowledge(trimmed, brief.summary);

  const dreamDone = asked(history, DREAM_MARK) || covered.dream;
  const partyDone = asked(history, PARTY_MARK) || covered.party;
  const walkDone = asked(history, WALK_MARK) || covered.walk;
  const settingDone = asked(history, SETTING_MARK) || covered.setting;
  const paceDone = asked(history, PACE_MARK) || covered.pace;
  const leadDone =
    input.interests.length < 2 || asked(history, LEAD_MARK) || covered.lead;
  const budgetTotalDone = budgetTopicAsked(history, "total") || covered.budgetTotal;
  const budgetSplitDone = budgetTopicAsked(history, "split") || covered.budgetSplit;
  const budgetFoodDone = budgetTopicAsked(history, "food") || covered.budgetFood;

  if (
    dreamDone &&
    paceDone &&
    partyDone &&
    walkDone &&
    settingDone &&
    leadDone &&
    budgetTotalDone &&
    budgetSplitDone &&
    budgetFoodDone
  ) {
    // Never dead-end on "ready to generate" — keep asking like a travel agent.
    return {
      reply: continueAgentReply(place, brief.summary, history),
      done: false,
      choices: continueAgentChoices(history),
    };
  }

  if (!dreamDone) {
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

  // Per-city pace when multi-city and pace not yet collected per destination.
  const paceCityMark = "pace would you prefer in";
  if (cities.length > 1 && paceDone) {
    const unanswered = cities.find(
      (city) => !asked(history, `${paceCityMark} ${city}`),
    );
    if (unanswered) {
      return {
        reply: `${heard}For ${unanswered}, what pace would you prefer in ${unanswered}?`,
        done: false,
        choices: [
          { id: `pace-relaxed-${unanswered}`, label: "Relaxed" },
          { id: `pace-moderate-${unanswered}`, label: "Moderate" },
          { id: `pace-fast-${unanswered}`, label: "Fast-paced" },
        ],
      };
    }
  }

  if (!budgetTotalDone) {
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

  if (!budgetSplitDone) {
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

  if (!budgetFoodDone) {
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

  if (!partyDone) {
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

  if (!walkDone) {
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

  if (!settingDone) {
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

  if (!leadDone) {
    return {
      reply: `${heard}Which interest should lead the days?`,
      done: false,
      choices: [
        ...input.interests.slice(0, 3).map((interest) => ({ id: interest, label: interest })),
        { id: "equal", label: "Keep them equal" },
      ],
    };
  }

  if (!paceDone) {
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
    reply: continueAgentReply(place, brief.summary, history),
    done: false,
    choices: continueAgentChoices(history),
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

function acknowledge(message: string, summary: string): string {
  if (!message) return "";
  if (summary) return `Got it — ${summary}. `;
  if (/small|not large|local place|restaurant/i.test(message)) {
    return "Small places, and not big restaurants. ";
  }
  if (/money|waste|cheap|budget|worth/i.test(message)) {
    return "Fun, without wasting money. ";
  }
  if (/sight|famous|highlight/i.test(message)) {
    return "The well-known sights. ";
  }
  if (message.length >= 80) {
    return "Thanks — I pulled the details I could from that. ";
  }
  return "I'll use that. ";
}

function continueAgentReply(
  place: string,
  summary: string,
  history: ChatLine[],
): string {
  const lead = summary
    ? `Noted for ${place}: ${summary}. `
    : `Good progress on ${place}. `;
  if (!asked(history, "hotel neighborhood")) {
    return `${lead}Do you already have a hotel, or should we plan from a neighborhood feel?`;
  }
  if (!asked(history, "mornings or evenings")) {
    return `${lead}Are you more of a mornings person or evenings person on this trip?`;
  }
  if (!asked(history, "surprise stop")) {
    return `${lead}Want one surprise stop each day, or keep the plan predictable?`;
  }
  if (!asked(history, "travel day buffer")) {
    return `${lead}On arrival day, should we keep things light after the flight?`;
  }
  return `${lead}What else should I know about how you travel — energy, deal-breakers, or must-haves?`;
}

function continueAgentChoices(history: ChatLine[]): ClarifyChoice[] {
  if (!asked(history, "hotel neighborhood")) {
    return [
      { id: "hotel-booked", label: "Hotel already booked" },
      { id: "hotel-suggest", label: "Suggest a neighborhood" },
      { id: "hotel-flexible", label: "Flexible — decide later" },
    ];
  }
  if (!asked(history, "mornings or evenings")) {
    return [
      { id: "mornings", label: "Mornings" },
      { id: "evenings", label: "Evenings" },
      { id: "both", label: "A bit of both" },
    ];
  }
  if (!asked(history, "surprise stop")) {
    return [
      { id: "surprise-yes", label: "Yes — one surprise" },
      { id: "surprise-no", label: "No surprises" },
      { id: "surprise-maybe", label: "Only if it fits the vibe" },
    ];
  }
  return [
    { id: "more-energy", label: "Tell you about our energy" },
    { id: "more-avoid", label: "Share deal-breakers" },
    { id: "more-must", label: "Add a must-have" },
    { id: "more-other", label: "Something else" },
  ];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
