import { NextResponse } from "next/server";
import { z } from "zod";
import {
  localClarifyReply,
  replyIgnoresTraveler,
  type ChatLine,
} from "@/lib/trips/clarify-chat";
import type { ClarifyInput } from "@/lib/trips/clarify";

const lineSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
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
});

const SYSTEM = `You are Trip Wizard, a travel agent writing this chat for one specific trip. Be warm and concrete. Do not quote their sentence back.

Write the questions yourself for this destination. Do not walk through a fixed list such as hotel, food, then budget.

When the history is empty, open with a short orientation of a few real neighborhoods or areas in their city, then one or two questions you invent for these dates. Ask what they want to do, what a dream version of the trip would feel like, and how they like to travel. If past trip names are provided, ask whether this trip should feel like one of those. If the past-trip list is empty, do not invent one.

If they ask you something, answer it, then ask at most one follow-up. Use their words.
Do not invent hotel names, fares, opening hours, ratings, populations, or reservations.
When four useful answers are already in the history, you may set done to true.
Return JSON only: {"reply":"...","done":false}`;

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
    cities: body.cities,
  };
  const history = (body.history ?? []) as ChatLine[];
  const message = body.message?.trim() ?? "";
  const pastTrips = await recentTripNames();
  const local = localClarifyReply(input, history, message);
  const modeled = await modelReply(input, history, message, pastTrips, body.tripTitle);
  const reply =
    modeled && !replyIgnoresTraveler(message, modeled.reply) ? modeled : local;
  return NextResponse.json({
    reply: reply.reply,
    done: reply.done,
    summary: reply.reply,
    question: reply.done ? null : { id: "chat", prompt: reply.reply },
    why: null,
    questions: [],
    source: modeled && reply === modeled ? "model" : "rules",
  });
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
  tripTitle?: string,
): Promise<{ reply: string; done: boolean } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const Groq = (await import("groq-sdk")).default;
    const client = new Groq({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            destination: input.destination,
            cities: input.cities,
            tripTitle: tripTitle || "",
            pastTrips,
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
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { reply?: unknown; done?: unknown };
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
    return { reply: parsed.reply.trim(), done: parsed.done === true };
  } catch {
    return null;
  }
}
