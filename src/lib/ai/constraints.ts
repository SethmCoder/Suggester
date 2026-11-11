import { interestSynonyms } from "./validate-day";

export type TravelParty = "solo" | "couple" | "family" | "multigen" | "friends" | "business";
export type SettingLean = "indoor" | "outdoor" | "either";

const NIGHT = /nightlife|bar|pub|nightclub|casino|club/;
const OUTDOOR = /park|garden|beach|viewpoint|nature|outdoor/;
const INDOOR = /museum|gallery|mall|library|theatre|theater|aquarium/;

export function weightedInterestMatch(
  types: string[],
  interests: string[],
  weights?: Record<string, number>,
): number {
  if (!interests.length) return 0.5;
  const lower = types.map((type) => type.toLowerCase());
  const blob = lower.join(" ");
  let hit = 0;
  let sum = 0;
  for (const interest of interests) {
    const weight = clampWeight(weights?.[interest] ?? weights?.[interest.toLowerCase()]);
    sum += weight;
    const synonyms = interestSynonyms(interest);
    if (
      synonyms.some(
        (token) =>
          blob.includes(token) ||
          lower.some((type) => type.includes(token) || token.includes(type)),
      )
    ) {
      hit += weight;
    }
  }
  return Math.min(1, hit / Math.max(sum, 1));
}

function clampWeight(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(1, value));
}

export function partyFit(types: string[], party?: string): number {
  const blob = types.join(" ").toLowerCase();
  if ((party === "family" || party === "multigen") && NIGHT.test(blob)) return 0.15;
  if (party === "business" && NIGHT.test(blob)) return 0.45;
  return 0.75;
}

export function settingFit(types: string[], lean?: SettingLean): number {
  if (!lean || lean === "either") return 0.6;
  const blob = types.join(" ").toLowerCase();
  if (lean === "indoor") return INDOOR.test(blob) ? 0.9 : OUTDOOR.test(blob) ? 0.25 : 0.55;
  return OUTDOOR.test(blob) ? 0.9 : INDOOR.test(blob) ? 0.35 : 0.55;
}

export function stopCap(input: {
  intensity: "relaxed" | "balanced" | "packed";
  party?: string;
  tightBudget?: boolean;
}): number {
  let cap = input.intensity === "relaxed" ? 3 : input.intensity === "packed" ? 5 : 4;
  // Family / business trips stay a bit lighter, but never under 3 sightseeing stops.
  if (input.party === "family" || input.party === "multigen" || input.party === "business") {
    cap = Math.min(cap, 4);
    cap = Math.max(cap, 3);
  }
  if (input.tightBudget) cap = Math.min(cap, 3);
  return Math.max(3, cap);
}

export function nameIsAvoided(name: string, avoid: string[]): boolean {
  const lower = name.toLowerCase();
  return avoid.some((item) => item.trim() && lower.includes(item.trim().toLowerCase()));
}

export function cuisineConflicts(dietary: string | undefined, cuisine: string | null | undefined): boolean {
  if (!dietary?.trim() || !cuisine?.trim()) return false;
  const diet = dietary.toLowerCase();
  const food = cuisine.toLowerCase();
  if (/vegetarian|vegan/.test(diet) && /steak|bbq|meat|burger/.test(food)) return true;
  if (/halal/.test(diet) && /pork|bacon/.test(food)) return true;
  if (/kosher/.test(diet) && /pork|shellfish|bacon/.test(food)) return true;
  if (/gluten/.test(diet) && /pizza|noodle|bakery/.test(food)) return true;
  return false;
}

export function feeLabel(fee: string | null | undefined): string {
  if (fee === "no") return "OpenStreetMap lists this as free.";
  if (fee === "yes") return "A fee is listed, amount not listed.";
  return "Cost not listed";
}

export function accessNote(input: {
  wheelchair?: string | null;
  stepFree: boolean;
}): { drop: boolean; note: string } {
  if (input.wheelchair === "yes") {
    return { drop: false, note: "OpenStreetMap lists this as wheelchair-accessible." };
  }
  if (input.wheelchair === "no" && input.stepFree) {
    return { drop: true, note: "OpenStreetMap lists this as not wheelchair-accessible." };
  }
  return { drop: false, note: "Accessibility is not listed." };
}

export function wantsStepFree(accessibility?: string): boolean {
  return /step-free|step free|wheelchair|no stairs|limited walking|accessible/i.test(accessibility ?? "");
}

function clock(value: string): number {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function overlaps(start: string, duration: number, otherStart: string, otherDuration: number): boolean {
  const a = clock(start);
  const b = clock(otherStart);
  return a < b + otherDuration && b < a + duration;
}

export type ConstraintStop = {
  placeId: string;
  name: string;
  startTime: string;
  durationMinutes: number;
  travelMinutesFromPrev?: number;
  travelRouted?: boolean;
  types?: string[];
  wheelchair?: string | null;
  fee?: string | null;
  cuisine?: string | null;
  priority?: "must_see" | "preferred" | "optional" | string;
};

export function applyDayConstraints<T extends ConstraintStop>(
  stops: T[],
  input: {
    maxWalkMinutes?: number;
    walking: boolean;
    stepFree: boolean;
    dietary?: string;
    transit?: { start: string; durationMinutes: number }[];
    /** When true, drop outdoor sightseeing that is not a must-see. */
    wetWeather?: boolean;
    isOutdoor?: (stop: T) => boolean;
    isMustSee?: (stop: T) => boolean;
  },
): {
  kept: T[];
  dropped: { item: T; reason: string }[];
  notes: Record<string, { fee: string; access: string; cuisine?: string }>;
} {
  const kept: T[] = [];
  const dropped: { item: T; reason: string }[] = [];
  const notes: Record<string, { fee: string; access: string; cuisine?: string }> = {};
  for (const stop of stops) {
    const anchored = stop.placeId.startsWith("flight:") || stop.placeId.startsWith("transit:");
    if (!anchored && input.transit?.some((block) => overlaps(stop.startTime, stop.durationMinutes, block.start, block.durationMinutes))) {
      dropped.push({ item: stop, reason: `${stop.name} overlaps the intercity trip, so it was left off.` });
      continue;
    }
    if (
      !anchored &&
      input.wetWeather &&
      input.isOutdoor?.(stop) &&
      !input.isMustSee?.(stop)
    ) {
      dropped.push({
        item: stop,
        reason: `${stop.name} looks outdoor and the forecast is wet, so it was left off for an indoor day.`,
      });
      continue;
    }
    const access = accessNote({ wheelchair: stop.wheelchair, stepFree: input.stepFree });
    if (!anchored && access.drop) {
      dropped.push({ item: stop, reason: `${stop.name} was left off. ${access.note}` });
      continue;
    }
    if (!anchored && cuisineConflicts(input.dietary, stop.cuisine)) {
      dropped.push({
        item: stop,
        reason: `${stop.name} lists cuisine “${stop.cuisine}”, which conflicts with the dietary note.`,
      });
      continue;
    }
    const travel = stop.travelMinutesFromPrev ?? 0;
    if (
      !anchored &&
      input.walking &&
      input.maxWalkMinutes &&
      stop.travelRouted &&
      travel > input.maxWalkMinutes
    ) {
      dropped.push({
        item: stop,
        reason: `${stop.name} is a routed walk of ${travel} minutes, over the ${input.maxWalkMinutes}-minute limit.`,
      });
      continue;
    }
    notes[stop.placeId] = {
      fee: feeLabel(stop.fee),
      access: access.note,
      cuisine: stop.cuisine ? undefined : /restaurant|cafe|food/.test((stop.types ?? []).join(" ")) ? "Cuisine is not listed." : undefined,
    };
    kept.push(stop);
  }
  return { kept, dropped, notes };
}

export function missingMustSees(mustSee: string[], keptNames: string[]): string[] {
  const warnings: string[] = [];
  for (const name of mustSee) {
    const needle = name.trim().toLowerCase();
    if (!needle) continue;
    const found = keptNames.some((kept) => kept.toLowerCase().includes(needle) || needle.includes(kept.toLowerCase()));
    if (found) continue;
    const alternative = keptNames[0];
    warnings.push(
      alternative
        ? `Could not schedule ${name}. A kept stop on this trip is ${alternative}.`
        : `Could not schedule ${name}. No listed alternative was kept.`,
    );
  }
  return warnings;
}

export function constraintsFromConversation(text: string, interests: string[] = []): {
  party?: TravelParty;
  maxWalkMinutes?: number;
  indoorOutdoor?: SettingLean;
  interestWeights?: Record<string, number>;
  accessibility?: string;
} {
  const lower = text.toLowerCase();
  const out: ReturnType<typeof constraintsFromConversation> = {};
  if (/multigenerational/.test(lower)) out.party = "multigen";
  else if (
    /family with children|with children|family|\d{1,2}\s*[- ]?year(?:s)?[- ]old|traveling with .{0,40}\b(?:kid|child|son|daughter)\b/.test(
      lower,
    )
  ) {
    out.party = "family";
  } else if (/friends/.test(lower)) out.party = "friends";
  else if (/business/.test(lower)) out.party = "business";
  else if (/couple/.test(lower)) out.party = "couple";
  else if (/\bsolo\b/.test(lower)) out.party = "solo";
  if (/under 15 minutes/.test(lower)) out.maxWalkMinutes = 15;
  else if (/about 30 minutes/.test(lower)) out.maxWalkMinutes = 30;
  if (/mostly indoors|indoors/.test(lower) && !/either indoors or outdoors/.test(lower)) out.indoorOutdoor = "indoor";
  else if (/mostly outdoors|outdoors/.test(lower)) out.indoorOutdoor = "outdoor";
  else if (/either indoors or outdoors/.test(lower)) out.indoorOutdoor = "either";
  if (/step-free|wheelchair/.test(lower)) out.accessibility = "step-free";
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/which interest should lead/i.test(lines[i])) continue;
    const answer = lines[i + 1] ?? "";
    if (/keep them equal/i.test(answer)) break;
    const lead = interests.find((interest) => answer.toLowerCase().includes(interest.toLowerCase()));
    if (lead) {
      out.interestWeights = Object.fromEntries(interests.map((interest) => [interest, interest === lead ? 3 : 1]));
    }
    break;
  }
  return out;
}
