import { NextResponse } from "next/server";
import { z } from "zod";
import { emptyTraveler, type TravelerProfile } from "@/lib/profile/traveler";
import { budgetQuestionsPending, repeatsBudgetTopic } from "@/lib/trips/budget";
import {
  localClarifyReply,
  replyIgnoresTraveler,
  replyRepeats,
  tripCities,
  type ChatLine,
  type ClarifyChoice,
  type ClarifyTurn,
} from "@/lib/trips/clarify-chat";
import type { ClarifyInput } from "@/lib/trips/clarify";
import {
  coveredClarifyTopics,
  parseTripBrief,
} from "@/lib/trips/parse-brief";

const lineSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(6000),
});

const travelerSchema = z.object({
  completed: z.boolean().optional(),
  age: z.string().max(40).optional(),
  dream: z.string().max(160).optional(),
  answers: z
    .array(
      z.object({
        question: z.string().max(300),
        answer: z.string().max(300),
      }),
    )
    .max(8)
    .optional(),
});

const bodySchema = z.object({
  destination: z.string().default(""),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  travelers: z.number().optional(),
  budget: z.number().nullable().optional(),
  interests: z.array(z.string()).default([]),
  intensity: z.string().optional(),
  transport: z.string().optional(),
  dietary: z.string().optional(),
  accessibility: z.string().optional(),
  mustSee: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
  idealTrip: z.string().optional(),
  cities: z.array(z.string()).optional(),
  tripTitle: z.string().optional(),
  history: z.array(lineSchema).max(24).optional(),
  message: z.string().max(6000).optional(),
  traveler: travelerSchema.nullable().optional(),
});

const SYSTEM = `You are a travel agent for Waypoint, chatting about one specific trip. Be warm, curious, and concrete. Do not quote their whole message back.

You are not ChatGPT listing generic tips — you interview the traveler like an agent who will fill their trip sheet.

Travelers often paste a long brief (who they travel with, ages, interests, must-dos, budget, pace). First extract what they already said. In one short sentence, acknowledge only the useful facts. Then ask exactly one follow-up about something still missing.

Never re-ask a fact they already gave. Never repeat a question that is already in the history.

If more than one city is listed, talk about the whole trip.

Do not ask how many days, the dates, or which cities they are visiting — those are already chosen in the form.

Every follow-up is multiple choice. Write 3 or 4 short options. Do not include Other; the app adds that.

Always keep done=false. Never say you are ready to build the trip, never tell them to tap Generate, and never end the conversation. When core topics are covered, ask deeper travel-agent questions (hotel neighborhood, mornings vs evenings, arrival-day energy, deal-breakers, surprises).

Cover when missing: who is traveling (kids/ages if family), walk comfort, indoors vs outdoors, day pace, budget, hotel preference, and anything personal that helps plan.

If a saved traveler profile or past trip names are provided, use only those facts. Do not invent hotels, fares, hours, ratings, or reservations.
Return JSON only: {"reply":"...","done":false,"choices":[{"id":"a","label":"..."}]}`;

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const input: ClarifyInput = {
    destination: body.destination,
    startDate: body.startDate,
    endDate: body.endDate,
    travelers: body.travelers,
    budget: body.budget,
    interests: body.interests,
    intensity: body.intensity,
    transport: body.transport,
    dietary: body.dietary,
    accessibility: body.accessibility,
    mustSee: body.mustSee,
    avoid: body.avoid,
    idealTrip: body.idealTrip,
    cities: tripCities({
      destination: body.destination,
      interests: body.interests,
      cities: body.cities,
    }),
  };
  const history = (body.history ?? []) as ChatLine[];
  const message = body.message?.trim() ?? "";
  const userCorpus = [
    ...history.filter((line) => line.role === "user").map((line) => line.text),
    message,
    body.idealTrip ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const extracted = parseTripBrief(userCorpus);
  const covered = coveredClarifyTopics(userCorpus, input.interests);
  const [pastTrips, savedTraveler] = await Promise.all([recentTripNames(), loadTraveler()]);
  const traveler = mergeTraveler(savedTraveler, body.traveler);
  const local = localClarifyReply(input, history, message);
  const opening = history.every((line) => line.role !== "assistant");
  const richMessage = message.length >= 80;
  const modeled =
    opening && !richMessage
      ? null
      : await modelReply(input, history, message, pastTrips, traveler, body.tripTitle, extracted);
  const previous = [...history].reverse().find((line) => line.role === "assistant")?.text;
  const modelOk =
    modeled &&
    !replyIgnoresTraveler(message, modeled.reply) &&
    !replyRepeats(previous, modeled.reply) &&
    (modeled.done || modeled.choices.length >= 2) &&
    !(
      modeled.done &&
      (stillNeedsBudget(history, covered) ||
        constraintsStillOpen(history, input.interests, covered))
    ) &&
    !repeatsBudgetTopic(history, modeled.reply);
  const reply = modelOk && modeled ? modeled : local;
  // Generate is user-driven via the pulsing button — chat never ends the interview.
  const choices =
    reply.choices.length >= 2
      ? reply.choices
      : [
          { id: "more-vibe", label: "Tell you more about our vibe" },
          { id: "more-avoid", label: "Share deal-breakers" },
          { id: "more-must", label: "Add a must-have" },
        ];
  return NextResponse.json({
    reply: reply.reply.replace(
      /tap Generate itinerary|ready to generate|I can build this/gi,
      "tell me a bit more",
    ),
    done: false,
    choices,
    allowOther: true,
    summary: reply.reply,
    question: { id: "chat", prompt: reply.reply },
    why: null,
    questions: [],
    extracted,
    source: modelOk ? "model" : "rules",
  });
}

function stillNeedsBudget(
  history: ChatLine[],
  covered: ReturnType<typeof coveredClarifyTopics>,
): boolean {
  if (covered.budgetTotal && covered.budgetSplit && covered.budgetFood) return false;
  return budgetQuestionsPending(history);
}

function constraintsStillOpen(
  history: ChatLine[],
  interests: string[],
  covered: ReturnType<typeof coveredClarifyTopics>,
): boolean {
  const asked = history
    .filter((line) => line.role === "assistant")
    .map((line) => line.text.toLowerCase())
    .join("\n");
  if (!covered.party && !asked.includes("who is traveling")) return true;
  if (!covered.walk && !asked.includes("how long a walk")) return true;
  if (!covered.setting && !asked.includes("indoors or outdoors")) return true;
  if (
    interests.length > 1 &&
    !covered.lead &&
    !asked.includes("which interest should lead")
  ) {
    return true;
  }
  return false;
}

function mergeTraveler(
  saved: TravelerProfile | null,
  sent: z.infer<typeof travelerSchema> | null | undefined,
): TravelerProfile | null {
  const answers = sent?.answers ?? saved?.answers ?? [];
  const profile: TravelerProfile = {
    completed: Boolean(sent?.completed || saved?.completed),
    age: sent?.age || saved?.age,
    dream: sent?.dream || saved?.dream,
    answers,
  };
  if (!profile.completed && !profile.age && !profile.dream && answers.length === 0) return null;
  return profile;
}

async function loadTraveler(): Promise<TravelerProfile | null> {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("traveler_profile")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { traveler_profile?: TravelerProfile | null }).traveler_profile;
    if (!raw || typeof raw !== "object") return null;
    return { ...emptyTraveler(), ...raw, answers: raw.answers ?? [] };
  } catch {
    return null;
  }
}

async function recentTripNames(): Promise<string[]> {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from("trips")
      .select("destination")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    return (data ?? [])
      .map((trip) => trip.destination)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  } catch {
    return [];
  }
}

async function modelReply(
  input: ClarifyInput,
  history: ChatLine[],
  message: string,
  pastTrips: string[],
  traveler: TravelerProfile | null,
  tripTitle?: string,
  extracted?: ReturnType<typeof parseTripBrief>,
): Promise<ClarifyTurn | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const { groqChat } = await import("@/lib/ai/groq");
    const raw = await groqChat({
      temperature: 0.4,
      effort: message.length >= 80 ? "medium" : "low",
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            cities: tripCities(input),
            tripTitle: tripTitle || "",
            pastTrips,
            traveler,
            travelers: input.travelers,
            interests: input.interests,
            intensity: input.intensity,
            transport: input.transport,
            idealTrip: input.idealTrip,
            alreadyExtracted: extracted ?? null,
            history,
            message,
          }),
        },
      ],
    });
    if (!raw) return null;
    return parseTurn(raw);
  } catch {
    return null;
  }
}

function parseTurn(raw: string): ClarifyTurn | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: { reply?: unknown; done?: unknown; choices?: unknown };
  try {
    parsed = JSON.parse(match[0]) as { reply?: unknown; done?: unknown; choices?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
  const choices: ClarifyChoice[] = [];
  if (Array.isArray(parsed.choices)) {
    for (const choice of parsed.choices) {
      if (!choice || typeof choice !== "object") continue;
      const label = "label" in choice && typeof choice.label === "string" ? choice.label.trim() : "";
      const id = "id" in choice && typeof choice.id === "string" ? choice.id.trim() : label;
      if (!label || choices.some((item) => item.label.toLowerCase() === label.toLowerCase())) continue;
      choices.push({ id: id.slice(0, 40) || `c${choices.length}`, label: label.slice(0, 80) });
      if (choices.length >= 4) break;
    }
  }
  return { reply: parsed.reply.trim(), done: parsed.done === true, choices };
}
