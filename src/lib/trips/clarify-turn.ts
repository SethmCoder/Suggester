import {
  fallbackClarifyQuestions,
  type ClarifyInput,
  type ClarifyQuestion,
} from "@/lib/trips/clarify";

const WHY: Record<string, string> = {
  food: "Food limits change which meals can sit on the plan.",
  party: "Who is traveling changes pace, walking, and how full a day should be.",
  spend: "A spending range changes which stops are realistic.",
  meals: "Meal style changes how much time stays between sights.",
  "city-pace": "Knowing which city should be quieter avoids packing the wrong days.",
  purpose: "The reason for the trip changes which stops are worth the time.",
  limits: "Fixed bookings and limits are the constraints the day has to fit.",
  anchor: "A packed day needs one stop that should not be cut.",
};

export function settingsBrief(input: ClarifyInput): string {
  const cities = (input.cities ?? []).filter(Boolean);
  const place = cities.length ? cities.join(", ") : input.destination || "your trip";
  const bits = [`You are planning ${place}`];
  if (input.startDate) bits.push(`starting ${input.startDate}`);
  if (input.travelers) bits.push(`for ${input.travelers} traveler${input.travelers === 1 ? "" : "s"}`);
  if (input.intensity) bits.push(`at a ${input.intensity} pace`);
  if (input.transport) bits.push(`getting around by ${input.transport}`);
  if (input.interests.length) bits.push(`with an interest in ${input.interests.join(", ")}`);
  return `${bits.join(", ")}. I will only ask about something that is still missing.`;
}

export function nextClarifyTurn(
  input: ClarifyInput,
  answeredIds: string[],
): { summary: string; question: ClarifyQuestion | null; why: string | null } {
  const summary = settingsBrief(input);
  const answered = new Set(answeredIds);
  const next = fallbackClarifyQuestions(input).find((q) => !answered.has(q.id)) ?? null;
  return {
    summary,
    question: next,
    why: next ? WHY[next.id] ?? "This changes how the days are built." : null,
  };
}
