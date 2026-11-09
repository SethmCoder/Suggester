import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDreamerSuggestions } from "@/lib/dreamer/suggestions";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const svc = createServiceClient();
  let destination = "Tokyo";
  let stayDays: number | null = 3;
  let month: number | null = null;

  if (svc) {
    const { data: dream } = await svc
      .from("future_trips")
      .select("destination, potential_start, estimated_duration_days, preferences")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!dream) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    destination = dream.destination;
    stayDays = dream.estimated_duration_days;
    if (dream.potential_start) {
      month = Number(String(dream.potential_start).slice(5, 7));
    }
  }

  const suggestions = buildDreamerSuggestions({
    destination,
    month,
    stayDays,
  });

  if (svc) {
    await svc
      .from("future_trips")
      .update({
        preferences: { dreamer: { suggestions } },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", user.id);
  }

  return NextResponse.json({ suggestions });
}
