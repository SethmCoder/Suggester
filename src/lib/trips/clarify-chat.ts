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

const DREAM_MARK = "dream trip feel like";
const WHERE_MARK = "which part of the trip should carry that";
const PACE_MARK = "how full should the days feel";
const PARTY_MARK = "who is traveling";
const TRAVELER_STYLE_MARK = "how do you usually like to travel";
const ENERGY_MARK = "energy on vacation";
const FEEL_MARK = "most want to feel on this trip";
const DEALBREAKER_MARK = "hard deal-breakers i should respect";
const WALK_MARK = "how long a walk between stops";
const SETTING_MARK = "indoors or outdoors";
const LEAD_MARK = "which interest should lead";
/** Destination-specific follow-ups (Seattle → aviation, etc.). */
const CITY_HOOKS: {
  match: RegExp;
  /** Distinctive phrase used to detect the question already asked. */
  askedNeedle: string;
  reply: (city: string) => string;
  choices: ClarifyChoice[];
}[] = [
  {
    match: /\b(seattle|tacoma|bellevue|renton)\b/i,
    askedNeedle: "aviation scene",
    reply: (city) =>
      `${city} has a big aviation scene — want flight museums and airport views in the plan, or keep that light?`,
    choices: [
      { id: "aviation-yes", label: "Yes — lean into aviation" },
      { id: "aviation-light", label: "A little is fine" },
      { id: "aviation-no", label: "Skip aviation" },
    ],
  },
  {
    match: /\b(tokyo|osaka|kyoto|kanazawa)\b/i,
    askedNeedle: "classic temples and landmarks",
    reply: (city) =>
      `For ${city}, should days lean toward classic temples and landmarks, or quieter neighborhoods and food streets?`,
    choices: [
      { id: "jp-landmarks", label: "Temples and landmarks" },
      { id: "jp-neighborhoods", label: "Neighborhoods and food" },
      { id: "jp-mix", label: "A mix of both" },
    ],
  },
  {
    match: /\b(paris|lyon|marseille)\b/i,
    askedNeedle: "museum-heavy days",
    reply: (city) =>
      `${city} can fill days with museums — do you want museum-heavy days, or more cafés and wandering?`,
    choices: [
      { id: "museum-heavy", label: "Museum-heavy" },
      { id: "cafe-wander", label: "Cafés and wandering" },
      { id: "museum-mix", label: "One museum, then free time" },
    ],
  },
  {
    match: /\b(rome|florence|venice|milan)\b/i,
    askedNeedle: "major historic sites",
    reply: (city) =>
      `In ${city}, should we prioritize major historic sites, or leave room for food markets and piazzas?`,
    choices: [
      { id: "it-sites", label: "Major historic sites" },
      { id: "it-food", label: "Food and piazzas" },
      { id: "it-mix", label: "A balanced mix" },
    ],
  },
  {
    match: /\b(dubai|abu\s*dhabi)\b/i,
    askedNeedle: "desert or marina",
    reply: (city) =>
      `For ${city}, interested in a desert or marina evening, or keep it city-center only?`,
    choices: [
      { id: "desert-yes", label: "Include desert / marina" },
      { id: "city-only", label: "City-center only" },
      { id: "desert-maybe", label: "One evening out of town" },
    ],
  },
  {
    match: /\b(hanoi|ho chi minh|saigon|da nang)\b/i,
    askedNeedle: "famous for street food",
    reply: (city) =>
      `${city} is famous for street food — should meals lean street stalls, sit-down spots, or a mix?`,
    choices: [
      { id: "street", label: "Mostly street food" },
      { id: "sitdown", label: "Mostly sit-down" },
      { id: "food-mix", label: "A mix" },
    ],
  },
  {
    match: /\b(oaxaca|mexico\s*city|cdmx)\b/i,
    askedNeedle: "market and food-first",
    reply: (city) =>
      `In ${city}, want market and food-first days, or more museums and historic sites?`,
    choices: [
      { id: "mx-food", label: "Markets and food" },
      { id: "mx-museums", label: "Museums and history" },
      { id: "mx-mix", label: "A mix" },
    ],
  },
  {
    match: /\b(london|edinburgh)\b/i,
    askedNeedle: "pubs and neighborhoods",
    reply: (city) =>
      `For ${city}, should evenings lean pubs and neighborhoods, or theaters and big landmarks?`,
    choices: [
      { id: "uk-pubs", label: "Pubs and neighborhoods" },
      { id: "uk-landmarks", label: "Theaters and landmarks" },
      { id: "uk-mix", label: "A mix" },
    ],
  },
  {
    match: /\b(new\s*york|nyc|manhattan)\b/i,
    askedNeedle: "base most days in manhattan",
    reply: () =>
      `New York is huge — should we base most days in Manhattan, or spread into Brooklyn and beyond?`,
    choices: [
      { id: "nyc-manhattan", label: "Mostly Manhattan" },
      { id: "nyc-brooklyn", label: "Include Brooklyn" },
      { id: "nyc-spread", label: "Spread across boroughs" },
    ],
  },
];

function cityHookFor(cities: string[]): (typeof CITY_HOOKS)[number] | null {
  const blob = cities.join(" ");
  return CITY_HOOKS.find((hook) => hook.match.test(blob)) ?? null;
}

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
  const freeform = isFreeformRequest(trimmed);

  // Freeform instructions count as the vibe — don't force the canned dream MCQ.
  const dreamDone =
    asked(history, DREAM_MARK) || covered.dream || freeform;
  const partyDone = asked(history, PARTY_MARK) || covered.party;
  const walkDone = asked(history, WALK_MARK) || covered.walk;
  const settingDone = asked(history, SETTING_MARK) || covered.setting;
  const paceDone = asked(history, PACE_MARK) || covered.pace;
  const leadDone =
    input.interests.length < 2 || asked(history, LEAD_MARK) || covered.lead;
  const budgetTotalDone = budgetTopicAsked(history, "total") || covered.budgetTotal;
  const budgetSplitDone = budgetTopicAsked(history, "split") || covered.budgetSplit;
  const budgetFoodDone = budgetTopicAsked(history, "food") || covered.budgetFood;

  const styleDone =
    asked(history, TRAVELER_STYLE_MARK) ||
    /usually like to travel|planner|wander|spontaneous/i.test(userCorpus);
  const energyDone =
    asked(history, ENERGY_MARK) ||
    /energy on vacation|low[- ]key days|high energy|need downtime/i.test(
      userCorpus,
    );
  const feelDone =
    asked(history, FEEL_MARK) ||
    /most want to feel|feel inspired|feel rested|feel adventurous/i.test(
      userCorpus,
    );
  const dealbreakerDone =
    asked(history, DEALBREAKER_MARK) ||
    /deal-breaker|dealbreaker|hard no|must avoid/i.test(userCorpus);

  if (
    dreamDone &&
    paceDone &&
    partyDone &&
    styleDone &&
    energyDone &&
    feelDone &&
    dealbreakerDone &&
    walkDone &&
    settingDone &&
    leadDone &&
    budgetTotalDone &&
    budgetSplitDone &&
    budgetFoodDone
  ) {
    // Never dead-end on "ready to generate" — keep asking like a travel agent.
    // Ask deeper follow-ups one city at a time on multi-city trips.
    return {
      reply: freeform
        ? `${heard}${continueAgentReply({
            cities,
            summary: "",
            history,
          })}`
        : continueAgentReply({
            cities,
            summary: brief.summary,
            history,
          }),
      done: false,
      choices: continueAgentChoices(history, cities),
    };
  }

  if (freeform && trimmed) {
    // Offline / model-down path: still honor freeform text instead of ignoring it.
    const next = nextUncoveredQuestion({
      place,
      heard,
      history,
      covered,
      interests: input.interests,
      cities,
      partyDone,
      styleDone,
      energyDone,
      feelDone,
      dealbreakerDone,
      walkDone,
      settingDone,
      paceDone,
      leadDone,
      budgetTotalDone,
      budgetSplitDone,
      budgetFoodDone,
    });
    if (next) return next;
  }

  if (!dreamDone) {
    return {
      reply:
        cities.length > 1
          ? `${heard}For ${cities.join(" → ")}, what should a dream trip feel like?`
          : cities.length === 1
            ? `${heard}For ${cities[0]}, what should a dream trip feel like?`
            : `${heard}What should a dream trip feel like for you?`,
      done: false,
      choices: [
        { id: "small", label: "Small local places, not tourist traps" },
        { id: "sights", label: "The well-known sights" },
        { id: "value", label: "Fun days that do not waste money" },
        { id: "mix", label: "A mix of walking, food, and highlights" },
      ],
    };
  }

  // Get to know the traveler before logistics.
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

  if (!styleDone) {
    return {
      reply: `${heard}How do you usually like to travel?`,
      done: false,
      choices: [
        { id: "planner", label: "I like a clear plan" },
        { id: "loose", label: "Loose plan, room to wander" },
        { id: "spontaneous", label: "Mostly spontaneous" },
        { id: "mix-style", label: "A mix — structure with free blocks" },
      ],
    };
  }

  if (!energyDone) {
    return {
      reply: `${heard}What’s your typical energy on vacation?`,
      done: false,
      choices: [
        { id: "low-key", label: "Low-key — rest matters" },
        { id: "steady", label: "Steady — a few good things a day" },
        { id: "high", label: "High energy — pack the days" },
        { id: "varies", label: "Varies day to day" },
      ],
    };
  }

  if (!feelDone) {
    return {
      reply: `${heard}What do you most want to feel on this trip?`,
      done: false,
      choices: [
        { id: "feel-rested", label: "Rested and unhurried" },
        { id: "feel-inspired", label: "Inspired and curious" },
        { id: "feel-connected", label: "Connected to local life" },
        { id: "feel-adventurous", label: "Adventurous / accomplished" },
      ],
    };
  }

  if (!dealbreakerDone) {
    return {
      reply: `${heard}Any hard deal-breakers I should respect?`,
      done: false,
      choices: [
        { id: "no-crowds", label: "Avoid big crowds when possible" },
        { id: "no-early", label: "No early mornings" },
        { id: "no-long-transit", label: "No long transit days" },
        { id: "no-dealbreakers", label: "No hard deal-breakers" },
      ],
    };
  }

  // Destination hooks one city at a time (Tokyo temples, then Osaka, …).
  for (const city of cities) {
    const cityHook = cityHookFor([city]);
    if (!cityHook) continue;
    const alreadyForCity = history.some(
      (line) =>
        line.role === "assistant" &&
        line.text.toLowerCase().includes(cityHook.askedNeedle) &&
        line.text.toLowerCase().includes(city.toLowerCase()),
    );
    if (alreadyForCity) continue;
    return {
      reply: `${heard}${cityHook.reply(city)}`,
      done: false,
      choices: cityHook.choices,
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

  return {
    reply: continueAgentReply({
      cities,
      summary: brief.summary,
      history,
    }),
    done: false,
    choices: continueAgentChoices(history, cities),
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

function hotelMark(city: string): string {
  return `hotel in ${city}`;
}

function morningsMark(city: string): string {
  return `in ${city}, are you more of a mornings`;
}

function surpriseMark(city: string): string {
  return `one ${city} surprise stop`;
}

function arrivalMark(city: string): string {
  return `on arrival day in ${city}`;
}

function continueAgentReply(input: {
  cities: string[];
  summary: string;
  history: ChatLine[];
}): string {
  const cities = input.cities.length ? input.cities : ["this trip"];
  const lead = input.summary ? `Noted: ${input.summary}. ` : "";

  for (const city of cities) {
    const hook = cityHookFor([city]);
    if (!hook) continue;
    const already = input.history.some(
      (line) =>
        line.role === "assistant" &&
        line.text.toLowerCase().includes(hook.askedNeedle) &&
        line.text.toLowerCase().includes(city.toLowerCase()),
    );
    if (!already) return `${lead}${hook.reply(city)}`;
  }

  for (const city of cities) {
    if (!asked(input.history, hotelMark(city))) {
      return `${lead}Do you already have a hotel in ${city}, or should we plan from a neighborhood feel there?`;
    }
  }
  for (const city of cities) {
    if (!asked(input.history, morningsMark(city))) {
      return `${lead}In ${city}, are you more of a mornings person or evenings person?`;
    }
  }
  for (const city of cities) {
    if (!asked(input.history, surpriseMark(city))) {
      return `${lead}Want one ${city} surprise stop each day, or keep that city predictable?`;
    }
  }
  for (const city of cities) {
    if (!asked(input.history, arrivalMark(city))) {
      return `${lead}On arrival day in ${city}, should we keep things light after travel?`;
    }
  }
  const focus = cities[cities.length - 1] ?? "this trip";
  return `${lead}What else should I know about how you travel in ${focus} — energy, deal-breakers, or must-haves?`;
}

function continueAgentChoices(
  history: ChatLine[],
  cities: string[] = [],
): ClarifyChoice[] {
  const last = [...history]
    .reverse()
    .find((line) => line.role === "assistant")?.text;
  if (last) {
    const hook = CITY_HOOKS.find((item) =>
      last.toLowerCase().includes(item.askedNeedle),
    );
    if (hook) return hook.choices;
  }
  const cityList = cities.length ? cities : ["this trip"];
  for (const city of cityList) {
    if (!asked(history, hotelMark(city))) {
      return [
        { id: `hotel-booked-${city}`, label: `Hotel booked in ${city}` },
        { id: `hotel-suggest-${city}`, label: `Suggest a ${city} neighborhood` },
        { id: `hotel-flexible-${city}`, label: "Flexible — decide later" },
      ];
    }
  }
  for (const city of cityList) {
    if (!asked(history, morningsMark(city))) {
      return [
        { id: "mornings", label: "Mornings" },
        { id: "evenings", label: "Evenings" },
        { id: "both", label: "A bit of both" },
      ];
    }
  }
  for (const city of cityList) {
    if (!asked(history, surpriseMark(city))) {
      return [
        { id: "surprise-yes", label: "Yes — one surprise" },
        { id: "surprise-no", label: "No surprises" },
        { id: "surprise-maybe", label: "Only if it fits the vibe" },
      ];
    }
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

export function isFreeformRequest(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (t.length >= 48) return true;
  return /\b(i want|i need|please|can you|could you|add |include |avoid |prefer|make sure|don'?t |hotel|near |museum|instead|change |remove |focus on|day \d|light day|more food|less )\b/i.test(
    t,
  );
}

function nextUncoveredQuestion(input: {
  place: string;
  heard: string;
  history: ChatLine[];
  covered: ReturnType<typeof coveredClarifyTopics>;
  interests: string[];
  cities: string[];
  partyDone: boolean;
  styleDone: boolean;
  energyDone: boolean;
  feelDone: boolean;
  dealbreakerDone: boolean;
  walkDone: boolean;
  settingDone: boolean;
  paceDone: boolean;
  leadDone: boolean;
  budgetTotalDone: boolean;
  budgetSplitDone: boolean;
  budgetFoodDone: boolean;
}): ClarifyTurn | null {
  const { heard, place, history, cities } = input;
  if (!input.partyDone) {
    return {
      reply: `${heard}Who is traveling on this trip?`,
      done: false,
      choices: [
        { id: "solo", label: "Just me" },
        { id: "couple", label: "A couple" },
        { id: "family", label: "Family with kids" },
        { id: "friends", label: "Friends" },
      ],
    };
  }
  if (!input.styleDone) {
    return {
      reply: `${heard}How do you usually like to travel?`,
      done: false,
      choices: [
        { id: "planner", label: "I like a clear plan" },
        { id: "loose", label: "Loose plan, room to wander" },
        { id: "spontaneous", label: "Mostly spontaneous" },
        { id: "mix-style", label: "A mix — structure with free blocks" },
      ],
    };
  }
  if (!input.energyDone) {
    return {
      reply: `${heard}What’s your typical energy on vacation?`,
      done: false,
      choices: [
        { id: "low-key", label: "Low-key — rest matters" },
        { id: "steady", label: "Steady — a few good things a day" },
        { id: "high", label: "High energy — pack the days" },
        { id: "varies", label: "Varies day to day" },
      ],
    };
  }
  if (!input.feelDone) {
    return {
      reply: `${heard}What do you most want to feel on this trip?`,
      done: false,
      choices: [
        { id: "feel-rested", label: "Rested and unhurried" },
        { id: "feel-inspired", label: "Inspired and curious" },
        { id: "feel-connected", label: "Connected to local life" },
        { id: "feel-adventurous", label: "Adventurous / accomplished" },
      ],
    };
  }
  if (!input.dealbreakerDone) {
    return {
      reply: `${heard}Any hard deal-breakers I should respect?`,
      done: false,
      choices: [
        { id: "no-crowds", label: "Avoid big crowds when possible" },
        { id: "no-early", label: "No early mornings" },
        { id: "no-long-transit", label: "No long transit days" },
        { id: "no-dealbreakers", label: "No hard deal-breakers" },
      ],
    };
  }
  if (cities.length > 1 && !asked(history, WHERE_MARK)) {
    return {
      reply: `${heard}Which part of ${place} should carry that — ${cities.join(" or ")}?`,
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
  if (!input.paceDone) {
    return {
      reply: `${heard}How full should the days feel?`,
      done: false,
      choices: [
        { id: "relaxed", label: "Relaxed — lots of downtime" },
        { id: "balanced", label: "Balanced" },
        { id: "packed", label: "Packed — see a lot" },
      ],
    };
  }
  if (!input.walkDone) {
    return {
      reply: `${heard}How long a walk between stops is comfortable?`,
      done: false,
      choices: [
        { id: "walk-15", label: "Under 15 minutes" },
        { id: "walk-30", label: "About 30 minutes is fine" },
        { id: "walk-any", label: "Happy to walk farther" },
      ],
    };
  }
  if (!input.settingDone) {
    return {
      reply: `${heard}Mostly indoors or outdoors?`,
      done: false,
      choices: [
        { id: "indoor", label: "Mostly indoors" },
        { id: "outdoor", label: "Mostly outdoors" },
        { id: "either", label: "Either is fine" },
      ],
    };
  }
  if (!input.budgetTotalDone) {
    return {
      reply: `${heard}How much is set aside for the whole trip (roughly)?`,
      done: false,
      choices: [
        { id: "b500", label: "Under $500" },
        { id: "b1500", label: "$500–$1,500" },
        { id: "b3000", label: "$1,500–$3,000" },
        { id: "bmore", label: "More than $3,000" },
      ],
    };
  }
  return {
    reply: `${heard}${continueAgentReply({
      cities,
      summary: "",
      history,
    })}`,
    done: false,
    choices: continueAgentChoices(history, cities),
  };
}
