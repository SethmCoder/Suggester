import type { TravelParty, SettingLean } from "@/lib/ai/constraints";
import type {
  BudgetAllocation,
  RestaurantStyle,
} from "@/lib/trips/budget";

export type DreamStyle = "local" | "sights" | "value" | "mix";

export type ParsedTripBrief = {
  party?: TravelParty;
  childAges: number[];
  travelers?: number;
  interests: string[];
  mustSee: string[];
  avoid: string[];
  intensity?: "relaxed" | "balanced" | "packed";
  transport?: string;
  indoorOutdoor?: SettingLean;
  maxWalkMinutes?: number;
  budgetTotal?: number;
  budgetAllocation?: BudgetAllocation;
  restaurantStyle?: RestaurantStyle;
  dreamStyle?: DreamStyle;
  /** Short human summary of what was understood. */
  summary: string;
};

const INTEREST_WORDS: { label: string; pattern: RegExp }[] = [
  { label: "food", pattern: /\b(food|restaurants?|cuisine|culinary|eat(?:ing)?|meals?)\b/i },
  { label: "museums", pattern: /\b(museums?|galleries?|art|exhibits?)\b/i },
  { label: "history", pattern: /\b(history|historic|heritage|ruins?|castles?)\b/i },
  { label: "nature", pattern: /\b(nature|parks?|hiking|outdoors?|gardens?|beaches?)\b/i },
  { label: "architecture", pattern: /\b(architecture|buildings?|skyline|temples?)\b/i },
  { label: "shopping", pattern: /\b(shopping|markets?|boutiques?)\b/i },
  { label: "nightlife", pattern: /\b(nightlife|bars?|clubs?)\b/i },
  { label: "family", pattern: /\b(family[- ]friendly|kid[- ]friendly)\b/i },
  { label: "photography", pattern: /\b(photography|photo(?:s|graphy)?)\b/i },
  { label: "coffee", pattern: /\b(coffee|cafes?|cafés?)\b/i },
];

/**
 * Pull structured trip facts out of a long freeform traveler message so the
 * clarify chat can acknowledge them and only ask about what is still missing.
 */
export function parseTripBrief(text: string): ParsedTripBrief {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const out: ParsedTripBrief = {
    childAges: [],
    interests: [],
    mustSee: [],
    avoid: [],
    summary: "",
  };
  if (!raw) return out;

  out.childAges = extractChildAges(raw);
  out.party = detectParty(lower, out.childAges.length > 0);
  out.travelers = detectTravelerCount(lower, out.childAges.length);

  for (const item of INTEREST_WORDS) {
    if (item.pattern.test(raw) && !out.interests.includes(item.label)) {
      out.interests.push(item.label);
    }
  }
  for (const interest of extractListedAfter(raw, /(?:i\s+like|interests?(?:\s+include)?|into)\s*[:–-]?\s*/i)) {
    if (!out.interests.includes(interest)) out.interests.push(interest);
  }

  out.mustSee = unique([
    ...extractListedAfter(
      raw,
      /(?:i\s+want\s+to\s+(?:do|see|visit|go\s+to)|must[- ]see|bucket\s+list|don'?t\s+miss)\s*[:–-]?\s*/i,
    ),
    ...extractQuotedOrTitled(raw),
  ]).slice(0, 12);

  out.avoid = extractListedAfter(
    raw,
    /(?:avoid|don'?t\s+want|skip|no\s+more)\s*[:–-]?\s*/i,
  ).slice(0, 8);

  if (/\b(relax(?:ed|ing)?|slow(?:er)?|easy\s+pace|chill)\b/i.test(raw)) {
    out.intensity = "relaxed";
  } else if (/\b(packed|busy|full\s+days?|see\s+everything)\b/i.test(raw)) {
    out.intensity = "packed";
  } else if (/\b(balanced|moderate\s+pace)\b/i.test(raw)) {
    out.intensity = "balanced";
  }

  if (/\bdriv(?:e|ing)\b/i.test(raw)) out.transport = "driving";
  else if (/\b(transit|metro|subway|train|bus)\b/i.test(raw)) out.transport = "transit";
  else if (/\bcycl(?:e|ing)|bike\b/i.test(raw)) out.transport = "cycling";
  else if (/\bwalk(?:ing)?\b/i.test(raw)) out.transport = "walking";

  if (/\b(mostly\s+)?indoors?\b/i.test(raw) && !/either\s+indoors?\s+or\s+outdoors?/i.test(raw)) {
    out.indoorOutdoor = "indoor";
  } else if (/\b(mostly\s+)?outdoors?\b/i.test(raw)) {
    out.indoorOutdoor = "outdoor";
  } else if (/either\s+indoors?\s+or\s+outdoors?/i.test(raw)) {
    out.indoorOutdoor = "either";
  }

  if (/\bunder\s+15\s*(min|minutes)\b/i.test(raw)) out.maxWalkMinutes = 15;
  else if (/\babout\s+30\s*(min|minutes)|30[- ]minute\s+walk\b/i.test(raw)) {
    out.maxWalkMinutes = 30;
  }

  const money = raw.match(/(?:\$|usd\s*)\s*(\d{2,6}(?:[,.]\d{3})?)/i);
  if (money) {
    const amount = Number(money[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) out.budgetTotal = Math.round(amount);
  } else if (/under\s*\$?\s*500/i.test(raw)) out.budgetTotal = 500;
  else if (/\$?\s*500\s*(to|–|-)\s*\$?\s*1[,.]?500/i.test(raw)) out.budgetTotal = 1500;
  else if (/\$?\s*1[,.]?500\s*(to|–|-)\s*\$?\s*3[,.]?000/i.test(raw)) out.budgetTotal = 3000;

  if (/mostly\s+free/i.test(raw)) out.budgetAllocation = "mostly-free";
  else if (/mostly\s+food|meals?\s+budget/i.test(raw)) out.budgetAllocation = "food";
  else if (/mostly\s+sights|tickets?/i.test(raw)) out.budgetAllocation = "sights";
  else if (/getting\s+around|transit\s+budget/i.test(raw)) {
    out.budgetAllocation = "getting-around";
  }

  if (/street\s+food/i.test(raw)) out.restaurantStyle = "street";
  else if (/nicer\s+meal|fine\s+dining/i.test(raw)) out.restaurantStyle = "sit-down";
  else if (/casual\s+sit[- ]?down/i.test(raw)) out.restaurantStyle = "casual";

  if (/small\s+local|not\s+big\s+restaurants|local\s+places/i.test(raw)) {
    out.dreamStyle = "local";
  } else if (/well[- ]known\s+sights|famous\s+sights|tourist\s+highlights/i.test(raw)) {
    out.dreamStyle = "sights";
  } else if (/not\s+waste\s+money|budget[- ]friendly|value/i.test(raw)) {
    out.dreamStyle = "value";
  } else if (/mix\s+of\s+walking,\s*food|a\s+mix\s+of/i.test(raw)) {
    out.dreamStyle = "mix";
  }

  out.summary = summarizeBrief(out);
  return out;
}

/** Topics already covered by the traveler's words (history + latest message). */
export function coveredClarifyTopics(
  corpus: string,
  interests: string[] = [],
): {
  dream: boolean;
  party: boolean;
  walk: boolean;
  setting: boolean;
  pace: boolean;
  lead: boolean;
  budgetTotal: boolean;
  budgetSplit: boolean;
  budgetFood: boolean;
} {
  const brief = parseTripBrief(corpus);
  const lower = corpus.toLowerCase();
  return {
    dream: Boolean(brief.dreamStyle) || brief.mustSee.length > 0 || brief.interests.length > 0,
    party:
      Boolean(brief.party) ||
      brief.childAges.length > 0 ||
      /\b(solo|couple|friends|family|kids?|child|children|traveling with)\b/i.test(
        lower,
      ),
    walk: brief.maxWalkMinutes != null,
    setting: Boolean(brief.indoorOutdoor),
    pace: Boolean(brief.intensity),
    lead:
      interests.length <= 1 ||
      /which interest should lead|keep them equal/i.test(lower) ||
      brief.interests.length === 1,
    budgetTotal: brief.budgetTotal != null || /under\s*\$?\s*500|more than\s*\$?\s*3/i.test(lower),
    budgetSplit: Boolean(brief.budgetAllocation),
    budgetFood: Boolean(brief.restaurantStyle),
  };
}

function detectParty(lower: string, hasKids: boolean): TravelParty | undefined {
  if (/multigenerational|grandparents?/.test(lower)) return "multigen";
  if (
    hasKids ||
    /family with children|with (?:a |my |our )?(?:kids?|children|child|son|daughter)|12[- ]year[- ]old|traveling with .{0,40}\b(?:kid|child|son|daughter)\b/.test(
      lower,
    )
  ) {
    return "family";
  }
  if (/\bfriends\b/.test(lower)) return "friends";
  if (/\bbusiness\b/.test(lower)) return "business";
  if (/\bcouple\b|with my (?:partner|spouse|wife|husband)\b/.test(lower)) {
    return "couple";
  }
  if (/\bsolo\b|by myself|traveling alone\b/.test(lower)) return "solo";
  return undefined;
}

function detectTravelerCount(lower: string, childCount: number): number | undefined {
  const explicit = lower.match(
    /\b(\d+)\s*(?:people|travelers|travellers|of us|adults?)\b/,
  );
  if (explicit) {
    const n = Number(explicit[1]);
    if (n >= 1 && n <= 20) return n;
  }
  if (childCount > 0) return Math.max(2, childCount + 1);
  if (/\bcouple\b/.test(lower)) return 2;
  if (/\bsolo\b|by myself\b/.test(lower)) return 1;
  return undefined;
}

function extractChildAges(text: string): number[] {
  const ages = new Set<number>();
  const patterns = [
    /(\d{1,2})\s*[- ]?\s*year(?:s)?[- ]old/gi,
    /(?:kid|child|son|daughter|age[sd]?)\s*(?:is\s*)?(\d{1,2})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const age = Number(match[1]);
      if (age >= 1 && age <= 17) ages.add(age);
    }
  }
  return [...ages].sort((a, b) => a - b);
}

function extractListedAfter(text: string, lead: RegExp): string[] {
  const match = text.match(new RegExp(`${lead.source}([^\\.\\n]+)`, lead.flags));
  if (!match?.[1]) return [];
  return splitList(match[1]);
}

function extractQuotedOrTitled(text: string): string[] {
  const items: string[] = [];
  for (const match of text.matchAll(/"([^"]{2,60})"|'([^']{2,60})'/g)) {
    const value = (match[1] || match[2] || "").trim();
    if (value) items.push(titleCase(value));
  }
  return items;
}

function splitList(chunk: string): string[] {
  return chunk
    .split(/,|\/|&|\band\b/i)
    .map((part) => part.replace(/\betc\b/gi, "").trim())
    .map((part) => part.replace(/^(to |the |a |an )/i, "").trim())
    .filter((part) => part.length >= 2 && part.length <= 48)
    .map((part) => titleCase(part))
    .filter((part, index, all) => {
      const key = part.toLowerCase();
      return all.findIndex((item) => item.toLowerCase() === key) === index;
    });
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) =>
      word.length <= 2 && /^(of|to|in|on|at|a|an|the)$/i.test(word)
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function summarizeBrief(brief: ParsedTripBrief): string {
  const bits: string[] = [];
  if (brief.party === "family" && brief.childAges.length) {
    bits.push(
      `family with ${brief.childAges.map((age) => `${age}-year-old`).join(" and ")}`,
    );
  } else if (brief.party) {
    bits.push(brief.party === "multigen" ? "multigenerational group" : brief.party);
  }
  if (brief.interests.length) bits.push(`interests in ${brief.interests.join(", ")}`);
  if (brief.mustSee.length) bits.push(`must-dos: ${brief.mustSee.slice(0, 4).join(", ")}`);
  if (brief.intensity) bits.push(`${brief.intensity} pace`);
  if (brief.budgetTotal) bits.push(`about $${brief.budgetTotal}`);
  if (!bits.length) return "";
  return bits.join("; ");
}
