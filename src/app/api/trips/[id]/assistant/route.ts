import { groqChat } from "@/lib/ai/groq";
import {
  AI_MONTH_COOKIE,
  AI_USED_COOKIE,
  currentMonthKey,
  gateFeature,
  isAdvancedRequest,
  PRO_REQUIRED_MESSAGE,
} from "@/lib/billing/entitlements";
import { withProfileEntitlement } from "@/lib/billing/access";
import { plannerModel } from "@/lib/billing/model";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildLocalAssistantPatchAsync,
  messageIsQuestion,
} from "@/lib/ai/assistant-local";
import {
  assistantSystemPrompt,
  assistantUserPrompt,
} from "@/lib/ai/assistant-prompt";
import { assistantPatchSchema } from "@/lib/ai/patch";
import { getDemoTripPayload, isDemoTripId } from "@/lib/demo/data";
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
  const feature = isAdvancedRequest(message) ? "advanced" : "basic";
  let accessUserId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    accessUserId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    accessUserId = null;
  }
  const gate = gateFeature(
    feature,
    await withProfileEntitlement(
      (name) => cookieStore.get(name)?.value,
      accessUserId,
    ),
  );
  if (!gate.allowed) {
    return NextResponse.json(
      { error: PRO_REQUIRED_MESSAGE, code: "pro_required" },
      { status: 402 },
    );
  }
  const demo = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  if (demo && isDemoTripId(tripId)) {
    const payload = getDemoTripPayload(tripId);
    const patch = await buildLocalAssistantPatchAsync({
      message,
      days: payload.days,
      activities: payload.activities,
      dayEnd: "21:00",
      transport: payload.preferences.transport ?? "walking",
      destination: payload.trip.destination,
    });
    const response = NextResponse.json({ patch, mode: "demo" });
    if (gate.consumes) {
      response.cookies.set(AI_USED_COOKIE, String(gate.used + 1), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 40,
      });
      response.cookies.set(AI_MONTH_COOKIE, currentMonthKey(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 40,
      });
    }
    return response;
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

  let travelerContextJson: string | undefined;
  try {
    const {
      loadTravelIntelligence,
      intelligenceContextPayload,
    } = await import("@/lib/intelligence/server");
    const supabase = await createSupabaseServerClient();
    const profile = await loadTravelIntelligence(supabase, userId);
    const { fetchWishlist } = await import("@/lib/wishlist/server");
    const { fetchFutureTrips } = await import("@/lib/future-trips/server");
    const [wishlist, futures] = await Promise.all([
      fetchWishlist(supabase, userId).catch(() => ({ items: [] as { name: string; category: string; location: string | null }[] })),
      fetchFutureTrips(supabase, userId).catch(() => []),
    ]);
    travelerContextJson = JSON.stringify({
      travelIntelligence: intelligenceContextPayload(profile),
      wishlist: wishlist.items.slice(0, 20).map((item) => ({
        name: item.name,
        category: item.category,
        location: item.location,
      })),
      futureTrips: futures.slice(0, 12).map((row) => ({
        destination: row.destination,
        title: row.title,
        status: row.status,
        interests: row.interests,
      })),
    });
  } catch {
    travelerContextJson = undefined;
  }

  const apiKey = process.env.GROQ_API_KEY;
  const prefs = trip.preferences as
    | { dayEnd?: string; transport?: string }
    | undefined;
  const localArgs = {
    message,
    days: trip.days,
    activities: trip.activities,
    dayEnd: prefs?.dayEnd,
    transport: prefs?.transport,
    destination: trip.trip.destination as string | undefined,
  };

  // Food near stops needs OSM coords — always use the local recommender.
  const { isFoodRecommendQuery } = await import("@/lib/ai/recommend-food");
  let patch;
  if (isFoodRecommendQuery(message)) {
    patch = await buildLocalAssistantPatchAsync(localArgs);
  } else if (apiKey) {
    try {
      const model = await plannerModel();
      const raw = await groqChat({
        model,
        temperature: 0.3,
        effort: "medium",
        responseFormat: {
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
                          "set_travel",
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
                      travelMinutesFromPrev: { type: "integer" },
                      endTime: { type: "string" },
                      sortOrder: { type: "integer" },
                      lat: { type: "number" },
                      lng: { type: "number" },
                      address: { type: "string" },
                      recommended: { type: "boolean" },
                      popularityLabel: { type: "string" },
                      popularitySources: {
                        type: "array",
                        items: { type: "string" },
                      },
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
              travelerContextJson,
            }),
          },
        ],
      });

      if (!raw) throw new Error("Empty AI response");
      patch = assistantPatchSchema.parse(JSON.parse(raw));
    } catch {
      patch = await buildLocalAssistantPatchAsync(localArgs);
    }
  } else {
    patch = await buildLocalAssistantPatchAsync(localArgs);
  }

  if (messageIsQuestion(message)) {
    patch = { ...patch, operations: [] };
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

  const response = NextResponse.json({
    patch,
    mode: apiKey ? "ai" : "local",
  });
  if (gate.consumes) {
    response.cookies.set(AI_USED_COOKIE, String(gate.used + 1), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 40,
    });
    response.cookies.set(AI_MONTH_COOKIE, currentMonthKey(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 40,
    });
  }
  return response;
}
