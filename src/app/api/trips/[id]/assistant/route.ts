import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assistantPatchSchema } from "@/lib/ai/patch";
import { fetchTripFull } from "@/lib/db/trips";
import { createSupabaseServerClient, createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  message: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message } = bodySchema.parse(await req.json());
  const trip = await fetchTripFull(tripId, user.id);
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 503 });
  }

  const client = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "AssistantPatch",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "operations"],
          properties: {
            summary: { type: "string" },
            operations: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["op"],
                properties: {
                  op: { type: "string" },
                  activityId: { type: "string" },
                  toDayIndex: { type: "integer" },
                  toSortOrder: { type: "integer" },
                  placeId: { type: "string" },
                  startTime: { type: "string" },
                  durationMinutes: { type: "integer" },
                  priority: { type: "string" },
                  fields: { type: "object" },
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
        content:
          "You modify an existing itinerary via small patch operations. Never regenerate the whole trip. Respect user_locked and must_see unless the user explicitly asks to change them. Return JSON only.",
      },
      {
        role: "user",
        content: `Current itinerary JSON:\n${JSON.stringify(trip)}\n\nUser request: ${message}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
  }

  let patch;
  try {
    patch = assistantPatchSchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Invalid patch format" }, { status: 502 });
  }

  const svc = createServiceClient();
  if (svc) {
    await svc.from("assistant_messages").insert([
      { trip_id: tripId, role: "user", content: message },
      {
        trip_id: tripId,
        role: "assistant",
        content: patch.summary,
        pending_patch: patch,
      },
    ]);
  }

  return NextResponse.json({ patch });
}
