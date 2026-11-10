import { NextResponse } from "next/server";
import { z } from "zod";
import { emptyTraveler, type TravelerProfile } from "@/lib/profile/traveler";
import { budgetQuestionsPending, repeatsBudgetTopic } from "@/lib/trips/budget";
import {
  isFreeformRequest,
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
  partyType: z.string().optional(),
  dreamChoice: z.string().optional(),
  history: z.array(lineSchema).max(24).optional(),
  message: z.string().max(6000).optional(),
  traveler: travelerSchema.nullable().optional(),
});

const SYSTEM = `You are a travel agent for Waypoint for one specific trip. Be warm, curious, and concrete. Do not quote their whole message back.

Follow what the traveler actually asked. If they give freeform instructions (pace, hotel area, must-sees, avoid list, arrival-day energy, “make day 1 light”, “more food less museums”), acknowledge those specifics and apply them — do not ignore them to run a canned interview script.

You also fill their trip sheet. When they state facts, put structured updates in sheetUpdates (only fields they clearly stated). Allowed keys: party, childAges, travelers, interests, mustSee, avoid, intensity (relaxed|balanced|packed), transport, indoorOutdoor (indoor|outdoor|either), maxWalkMinutes, budgetTotal, budgetAllocation, restaurantStyle, dreamStyle (local|sights|value|mix), summary.

If they pasted a long brief: one short sentence acknowledging useful facts, then exactly one follow-up about something still missing.

On the first turn (empty message / opening), ask what a dream trip would feel like for this destination — vibe, not logistics. Do not open with budget, party size, or walk time unless those are the only gaps left.

After vibe, ask at least one destination-specific question tied to the city (examples: Seattle → aviation / Museum of Flight interest; Tokyo → temples vs neighborhoods; Paris → museum-heavy vs café wandering; Dubai → desert/marina vs city-center). Make the question concrete to that place, not generic.

Never re-ask a fact they already gave. Never repeat a question already in history.
Do not ask how many days, the dates, or which cities — those are on the form.
If more than one city is listed, talk about the whole trip.

Choices: when a follow-up fits multiple choice, return 3–4 short options (no Other; the app adds it). When they asked something open-ended or gave instructions, choices may be empty or soft next-steps — never invent fake options that ignore their request.

Always done=false. Never say you are ready to generate or tell them to tap Generate.
When core topics are covered, ask deeper agent questions (hotel neighborhood, mornings vs evenings, arrival-day energy, deal-breakers).
Do not invent hotels, fares, hours, ratings, or reservations.
Return JSON only:
{"reply":"...","done":false,"choices":[{"id":"a","label":"..."}],"sheetUpdates":{}}`;

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
  const sheetHints = [
    body.idealTrip ?? "",
    body.dreamChoice
      ? body.dreamChoice === "small"
        ? "Small local places, not tourist traps"
        : body.dreamChoice === "sights"
          ? "The well-known sights"
          : body.dreamChoice === "value"
            ? "Fun days that do not waste money"
            : body.dreamChoice === "mix"
              ? "A mix of walking, food, and highlights"
              : `dream:${body.dreamChoice}`
      : "",
    body.partyType ? `traveling as ${body.partyType}` : "",
    body.intensity ? `pace ${body.intensity}` : "",
    body.transport ? `get around by ${body.transport}` : "",
  ];
  const userCorpus = [
    ...history.filter((line) => line.role === "user").map((line) => line.text),
    message,
    ...sheetHints,
  ]
    .filter(Boolean)
    .join("\n");
  const extracted = parseTripBrief(userCorpus);
  const covered = coveredClarifyTopics(userCorpus, input.interests);
  const [pastTrips, savedTraveler] = await Promise.all([recentTripNames(), loadTraveler()]);
  const traveler = mergeTraveler(savedTraveler, body.traveler);
  const local = localClarifyReply(input, history, message);
  const opening = history.every((line) => line.role !== "assistant");
  // Prefer the model whenever the traveler said something — including short freeform asks.
  // Only skip the model on the silent opening greeting (empty message).
  const modeled =
    opening && !message
      ? null
      : await modelReply(
          input,
          history,
          message,
          pastTrips,
          traveler,
          body.tripTitle,
          extracted,
        );
  const previous = [...history].reverse().find((line) => line.role === "assistant")?.text;
  const freeform = isFreeformRequest(message);
  const modelOk = Boolean(
    modeled &&
      !replyIgnoresTraveler(message, modeled.reply) &&
      !replyRepeats(previous, modeled.reply) &&
      (freeform || modeled.choices.length >= 2 || !message) &&
      !(
        modeled.done &&
        (stillNeedsBudget(history, covered) ||
          constraintsStillOpen(history, input.interests, covered))
      ) &&
      !repeatsBudgetTopic(history, modeled.reply),
  );
  const reply = modelOk && modeled ? modeled : local;
  const mergedExtracted = {
    ...extracted,
    ...(modelOk && modeled?.sheetUpdates ? modeled.sheetUpdates : {}),
  };
  // Generate is user-driven via the pulsing button — chat never ends the interview.
  const choices =
    reply.choices.length >= 2
      ? reply.choices
      : freeform && modelOk
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
    extracted: mergedExtracted,
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

type ModeledTurn = ClarifyTurn & {
  sheetUpdates?: Record<string, unknown>;
};

async function modelReply(
  input: ClarifyInput,
  history: ChatLine[],
  message: string,
  pastTrips: string[],
  traveler: TravelerProfile | null,
  tripTitle?: string,
  extracted?: ReturnType<typeof parseTripBrief>,
): Promise<ModeledTurn | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const { groqChat } = await import("@/lib/ai/groq");
    const raw = await groqChat({
      temperature: 0.4,
      effort: message.length >= 48 || isFreeformRequest(message) ? "medium" : "low",
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
            freeformRequest: isFreeformRequest(message),
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

function parseTurn(raw: string): ModeledTurn | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: {
    reply?: unknown;
    done?: unknown;
    choices?: unknown;
    sheetUpdates?: unknown;
  };
  try {
    parsed = JSON.parse(match[0]) as {
      reply?: unknown;
      done?: unknown;
      choices?: unknown;
      sheetUpdates?: unknown;
    };
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
  const sheetUpdates =
    parsed.sheetUpdates &&
    typeof parsed.sheetUpdates === "object" &&
    !Array.isArray(parsed.sheetUpdates)
      ? (parsed.sheetUpdates as Record<string, unknown>)
      : undefined;
  return {
    reply: parsed.reply.trim(),
    done: parsed.done === true,
    choices,
    sheetUpdates,
  };
}
