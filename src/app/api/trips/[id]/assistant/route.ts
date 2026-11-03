import Groq from "groq-sdk";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildLocalAssistantPatch } from "@/lib/ai/assistant-local";
import {
  assistantSystemPrompt,
  assistantUserPrompt,
} from "@/lib/ai/assistant-prompt";
import { assistantPatchSchema } from "@/lib/ai/patch";
import { DEMO_TRIP_ID, getDemoTripPayload } from "@/lib/demo/data";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { fetchTripFull } from "@/lib/db/trips";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const bodySchema = z.object({
  message: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await params;
  const { message } = bodySchema.parse(await req.json());
  const cookieStore = await cookies();
  const demo = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  if (demo && tripId === DEMO_TRIP_ID) {
    const payload = getDemoTripPayload();
    const patch = buildLocalAssistantPatch({
      message,
      days: payload.days,
      activities: payload.activities,
    });
    return NextResponse.json({ patch, mode: "demo" });
  }

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trip = await fetchTripFull(tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  let patch;

  if (apiKey) {
    try {
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
                suggestions: { type: "array", items: { type: "string" } },
                operations: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["op"],
                    properties: {
                      op: {
                        type: "string",
                        enum: [
                          "move",
                          "delete",
                          "update",
                          "insert",
                          "shift_day",
                          "replace",
                        ],
                      },
                      activityId: { type: "string" },
                      toDayIndex: { type: "integer" },
                      toSortOrder: { type: "integer" },
                      placeId: { type: "string" },
                      name: { type: "string" },
                      newName: { type: "string" },
                      startTime: { type: "string" },
                      durationMinutes: { type: "integer" },
                      priority: { type: "string" },
                      dayIndex: { type: "integer" },
                      shiftMinutes: { type: "integer" },
                      reason: { type: "string" },
                      planningNote: { type: "string" },
                      fields: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          startTime: { type: "string" },
                          durationMinutes: { type: "integer" },
                          priority: { type: "string" },
                          planningNote: { type: "string" },
                          completed: { type: "boolean" },
                          name: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: [
          { role: "system", content: assistantSystemPrompt() },
          {
            role: "user",
            content: assistantUserPrompt({
              message,
              tripJson: JSON.stringify(trip),
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("Empty AI response");
      patch = assistantPatchSchema.parse(JSON.parse(raw));
    } catch {
      patch = buildLocalAssistantPatch({
        message,
        days: trip.days,
        activities: trip.activities,
      });
    }
  } else {
    patch = buildLocalAssistantPatch({
      message,
      days: trip.days,
      activities: trip.activities,
    });
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

  return NextResponse.json({
    patch,
    mode: apiKey ? "ai" : "local",
  });
}
