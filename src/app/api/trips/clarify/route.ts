import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fallbackClarifyQuestions,
  type ClarifyQuestion,
} from "@/lib/trips/clarify";

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
});

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const fallback = fallbackClarifyQuestions(body);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ questions: fallback, source: "rules" });
  }

  try {
    const client = new Groq({ apiKey });
    const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ClarifyQuestions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["questions"],
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "prompt"],
                  properties: {
                    id: { type: "string" },
                    prompt: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You prepare a trip planner. Read the traveler's answers and ask only what is still missing and would change the itinerary.
Return JSON: {"questions":[{"id":"short-id","prompt":"one question"}]}.
Ask 4 or 5 questions. Do not ask about facts they already gave (cities, dates, listed interests, must-see, avoid, dietary, accessibility, budget, pace, transport).
Questions should be personal and practical: who they travel with, food, money, energy, celebrations, fixed bookings, which city matters most.
Do not plan the itinerary in the questions.`,
        },
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      questions?: { id?: string; prompt?: string }[];
    };
    const questions: ClarifyQuestion[] = (parsed.questions ?? [])
      .map((q, i) => ({
        id: (q.id || `q${i + 1}`).toString().slice(0, 40),
        prompt: (q.prompt ?? "").trim(),
      }))
      .filter((q) => q.prompt.length > 8)
      .slice(0, 5);
    if (questions.length < 3) {
      return NextResponse.json({ questions: fallback, source: "rules" });
    }
    return NextResponse.json({ questions, source: "planner" });
  } catch {
    return NextResponse.json({ questions: fallback, source: "rules" });
  }
}
