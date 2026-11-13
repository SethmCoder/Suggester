import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePackingSampleList } from "@/lib/trips/sample-lists";

const bodySchema = z.object({
  kind: z.enum(["packing"]).default("packing"),
  destination: z.string().min(1).max(120),
  durationDays: z.number().int().min(1).max(60).optional(),
  party: z.string().max(40).nullable().optional(),
  wetWeather: z.boolean().optional(),
  interests: z.array(z.string().max(40)).max(12).optional(),
});

/**
 * Destination-based sample lists (packing first).
 * Works for signed-in and demo — no trip ownership required.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Say where you are going to build a sample list." },
      { status: 400 },
    );
  }

  const sample = await generatePackingSampleList({
    destination: parsed.data.destination,
    durationDays: parsed.data.durationDays,
    party: parsed.data.party,
    wetWeather: parsed.data.wetWeather,
    interests: parsed.data.interests,
  });

  return NextResponse.json(sample);
}
