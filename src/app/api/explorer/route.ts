import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withProfileEntitlement } from "@/lib/billing/access";
import {
  AI_MONTH_COOKIE,
  AI_USED_COOKIE,
  currentMonthKey,
  gateFeature,
  PRO_REQUIRED_MESSAGE,
} from "@/lib/billing/entitlements";
import { plannerModel } from "@/lib/billing/model";
import { EXPLORER_CATEGORIES } from "@/lib/explorer/types";
import { runExplorer } from "@/lib/explorer/run";
import { emptyPreferences } from "@/lib/explorer/validate";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";

const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  priceLevel: z.string().nullable(),
  hours: z.string().nullable(),
  mapsUrl: z.string().nullable(),
  photoName: z.string().nullable(),
  source: z.enum(["google", "openstreetmap"]),
  why: z.string(),
});

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  city: z.string().max(80).optional(),
  categories: z.array(z.enum(EXPLORER_CATEGORIES)).max(8).optional(),
  budget: z.string().max(12).optional(),
  tripId: z.string().max(80).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(8).optional(),
  preferences: z
    .object({
      cuisine: z.string().max(80).optional(),
      pace: z.string().max(80).optional(),
      avoid: z.string().max(80).optional(),
      atmosphere: z.string().max(80).optional(),
    })
    .optional(),
  previousPlaces: z.array(placeSchema).max(18).optional(),
});

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const cookieStore = await cookies();
  let accessUser: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const user = (await supabase.auth.getUser()).data.user;
    accessUser = user ? { id: user.id, email: user.email } : null;
  } catch {
    accessUser = null;
  }
  const gate = gateFeature(
    "basic",
    await withProfileEntitlement((name) => cookieStore.get(name)?.value, accessUser),
  );
  if (!gate.allowed) {
    return NextResponse.json({ error: PRO_REQUIRED_MESSAGE, code: "pro_required" }, { status: 402 });
  }

  const stored = await tripContext(body.tripId, accessUser?.id ?? null);
  const preferences = {
    ...emptyPreferences(),
    ...stored.preferences,
    cuisine: body.preferences?.cuisine || stored.preferences.cuisine,
    pace: body.preferences?.pace || stored.preferences.pace,
    avoid: body.preferences?.avoid || stored.preferences.avoid,
    atmosphere: body.preferences?.atmosphere || stored.preferences.atmosphere,
  };
  const result = await runExplorer({
    model: await plannerModel(),
    message: body.message,
    city: body.city?.trim() || stored.city,
    categories: body.categories ?? [],
    budget: body.budget || "any",
    preferences,
    history: body.history ?? [],
    previousPlaces: body.previousPlaces ?? [],
    excludeIds: stored.placeIds,
  });

  const response = NextResponse.json(result);
  if (gate.consumes) {
    response.cookies.set(AI_USED_COOKIE, String(gate.used + 1), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    response.cookies.set(AI_MONTH_COOKIE, currentMonthKey(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

async function tripContext(tripId: string | undefined, userId: string | null) {
  const empty = { city: "", placeIds: [] as string[], preferences: emptyPreferences() };
  if (!tripId || !userId || tripId.startsWith("demo-") || tripId.startsWith("offline-")) return empty;
  const db = createServiceClient();
  if (!db) return empty;
  const { data: trip } = await db
    .from("trips")
    .select("id, destination")
    .eq("id", tripId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!trip) return empty;
  const { data: days } = await db.from("itinerary_days").select("id").eq("trip_id", trip.id);
  const dayIds = (days ?? []).map((day) => day.id);
  const { data: activities } = dayIds.length
    ? await db.from("activities").select("place_id").in("day_id", dayIds)
    : { data: [] };
  const { data: prefs } = await db.from("trip_preferences").select("payload").eq("trip_id", trip.id).maybeSingle();
  const payload = (prefs?.payload ?? {}) as { dietary?: string; interests?: string[]; intensity?: string };
  return {
    city: trip.destination || "",
    placeIds: (activities ?? []).map((row) => row.place_id).filter((id): id is string => Boolean(id)),
    preferences: {
      cuisine: payload.dietary || "",
      pace: payload.intensity || "",
      avoid: "",
      atmosphere: (payload.interests ?? []).slice(0, 4).join(", "),
    },
  };
}
