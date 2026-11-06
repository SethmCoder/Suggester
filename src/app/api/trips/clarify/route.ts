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

const lineSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
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
  history: z.array(lineSchema).max(16).optional(),
  message: z.string().max(2000).optional(),
  traveler: travelerSchema.nullable().optional(),
});

const SYSTEM = `You are Trip Wizard, writing this chat for one specific trip. Be warm and concrete. Do not quote their sentence back.

The trip may include several cities. Talk about the whole trip. If more than one city is listed, do not ask only about the first city. Bring in a city that has not been discussed yet.

Never repeat a question that is already in the history. Read their latest answer and ask one new question that follows from it.

Every question is multiple choice. Write 3 or 4 short options a traveler can tap. Do not include an Other option; the app adds that. The reply is one or two sentences: acknowledge what they just said, then ask the question.

Do not ask how many days, the dates, or which cities they are visiting. Those are already chosen. Ask about the kind of days they want, using their latest answer and every city on the trip.

Before you set done, the history must already include three budget questions: how much is set aside for the whole trip, how that money should be used, and what kind of restaurants the days should lean toward. Ask any of those that are missing, as multiple choice. Use ranges for the total, and let a typed amount arrive through Other.
If a saved traveler profile is provided, use only those facts. If past trip names are provided, you may ask whether this trip should feel like one of those. If that list is empty, do not invent a past trip.
Do not invent hotel names, fares, opening hours, ratings, populations, or reservations.
When those budget answers and the pace of the days are already in the history, you may set done to true and offer no choices.
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
  const [pastTrips, savedTraveler] = await Promise.all([recentTripNames(), loadTraveler()]);
  const traveler = mergeTraveler(savedTraveler, body.traveler);
  const local = localClarifyReply(input, history, message);
  const opening = history.every((line) => line.role !== "assistant");
  const modeled = opening
    ? null
    : await modelReply(input, history, message, pastTrips, traveler, body.tripTitle);
  const previous = [...history].reverse().find((line) => line.role === "assistant")?.text;
  const modelOk =
    modeled &&
    !replyIgnoresTraveler(message, modeled.reply) &&
    !replyRepeats(previous, modeled.reply) &&
    (modeled.done || modeled.choices.length >= 2) &&
    !(modeled.done && (budgetQuestionsPending(history) || constraintsStillOpen(history, input.interests))) &&
    !repeatsBudgetTopic(history, modeled.reply);
  const reply = modelOk && modeled ? modeled : local;
  return NextResponse.json({
    reply: reply.reply,
    done: reply.done,
    choices: reply.choices,
    allowOther: !reply.done,
    summary: reply.reply,
    question: reply.done ? null : { id: "chat", prompt: reply.reply },
    why: null,
    questions: [],
    source: modelOk ? "model" : "rules",
  });
}

function constraintsStillOpen(history: ChatLine[], interests: string[]): boolean {
  const asked = history
    .filter((line) => line.role === "assistant")
    .map((line) => line.text.toLowerCase())
    .join("\n");
  if (!asked.includes("who is traveling")) return true;
  if (!asked.includes("how long a walk")) return true;
  if (!asked.includes("indoors or outdoors")) return true;
  if (interests.length > 1 && !asked.includes("which interest should lead")) return true;
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
): Promise<ClarifyTurn | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const { groqChat } = await import("@/lib/ai/groq");
    const raw = await groqChat({
      temperature: 0.4,
      effort: "low",
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
