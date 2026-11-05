import { NextResponse } from "next/server";
import { z } from "zod";
import { nextClarifyTurn } from "@/lib/trips/clarify-turn";
import type { ClarifyInput } from "@/lib/trips/clarify";

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
  answeredIds: z.array(z.string()).optional(),
});

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
  const turn = nextClarifyTurn(input, body.answeredIds ?? []);
  return NextResponse.json({
    summary: turn.summary,
    question: turn.question,
    why: turn.why,
    questions: turn.question ? [turn.question] : [],
    source: "rules",
  });
}
