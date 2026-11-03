import { NextResponse } from "next/server";
import { z } from "zod";
import { generateItinerary } from "@/lib/ai/generate-itinerary";

const bodySchema = z.object({
  destination: z.string().min(2),
  startDate: z.string(),
  endDate: z.string(),
  interests: z.array(z.string()).default([]),
  intensity: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  transport: z.string().default("walking"),
  mustSee: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  idealTrip: z.string().default(""),
  prefersHiddenGems: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = bodySchema.parse(json);
    const result = await generateItinerary(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
