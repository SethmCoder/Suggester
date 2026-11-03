import { NextResponse } from "next/server";
import { z } from "zod";
import { generateItinerary } from "@/lib/ai/generate-itinerary";
import { fetchTripFull } from "@/lib/db/trips";
import { createSupabaseServerClient, createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  dayIndex: z.number().int().min(0),
  mode: z.enum(["relaxed", "balanced", "packed", "optimize_geo"]).optional(),
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

  const { dayIndex, mode } = bodySchema.parse(await req.json());
  const full = await fetchTripFull(tripId, user.id);
  if (!full) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const prefs = full.preferences as {
    interests?: string[];
    intensity?: "relaxed" | "balanced" | "packed";
    transport?: string;
    prefersHiddenGems?: boolean;
  };

  const locked = full.activities.filter((a) => a.user_locked);
  const generated = await generateItinerary({
    destination: full.trip.destination,
    startDate: full.trip.start_date,
    endDate: full.trip.end_date,
    interests: prefs.interests ?? [],
    intensity:
      mode === "relaxed" || mode === "packed"
        ? mode
        : (prefs.intensity ?? "balanced"),
    transport: prefs.transport ?? "walking",
    mustSee: locked.map((a) => a.name),
    avoid: [],
    idealTrip: "",
    prefersHiddenGems: prefs.prefersHiddenGems,
  });

  const newDay = generated.days.find((d) => d.dayIndex === dayIndex);
  if (!newDay) {
    return NextResponse.json({ error: "Day not generated" }, { status: 400 });
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ day: newDay, apply: false });
  }

  const dayRow = full.days.find((d) => d.day_index === dayIndex);
  if (!dayRow) {
    return NextResponse.json({ error: "Day row missing" }, { status: 400 });
  }

  await svc
    .from("activities")
    .delete()
    .eq("day_id", dayRow.id)
    .eq("user_locked", false);

  return NextResponse.json({
    day: newDay,
    warnings: generated.warnings,
    preview: true,
  });
}
