import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { updateTripPreferences } from "@/lib/db/trips";
import type { TripPreferencesPayload } from "@/lib/types/trip";

const bodySchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export async function PATCH(
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

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const { data: existing } = await svc
      .from("trip_preferences")
      .select("payload")
      .eq("trip_id", tripId)
      .maybeSingle();
    const merged = {
      ...((existing?.payload as TripPreferencesPayload) ?? {
        destinations: [],
        interests: [],
        intensity: "balanced" as const,
        transport: "walking",
      }),
      ...(body.payload as unknown as TripPreferencesPayload),
    };
    await updateTripPreferences(tripId, user.id, merged);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
