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
  history: z.array(lineSchema).max(16).optional(),
  message: z.string().max(2000).optional(),
});

const SYSTEM = `You are Trip Wizard, a travel agent who wants this specific trip to be as good as it can be. Be warm, specific, and short. Do not quote their sentence back.
Respond to the latest message. Do not ignore it to ask an unrelated intake question.
If they ask for examples or what a good trip looks like, give two or three day shapes using their destination and interests. Say these are patterns, not bookings.
If they say who they are traveling with, follow up about those people (ages, walking, naps, pace) before you change the subject.
A one-word yes or no about companions is not enough. Ask who is coming.
Use their words. One short reply, then at most one question.
Do not invent hotel names, fares, opening hours, ratings, or reservations.
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
  const local = localClarifyReply(input, history, message);
  const modeled = await modelReply(input, history, message);
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

async function modelReply(
  input: ClarifyInput,
  history: ChatLine[],
  message: string,
): Promise<{ reply: string; done: boolean } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const Groq = (await import("groq-sdk")).default;
    const client = new Groq({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            destination: input.destination,
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
