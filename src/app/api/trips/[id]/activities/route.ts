import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  activities: z.array(
    z.object({
      id: z.string(),
      day_id: z.string(),
      sort_order: z.number(),
      start_time: z.string().nullable().optional(),
      duration_minutes: z.number().nullable().optional(),
      priority: z.string().nullable().optional(),
      planning_note: z.string().nullable().optional(),
      completed: z.boolean().optional(),
      user_locked: z.boolean().optional(),
      name: z.string().optional(),
    }),
  ),
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

  const body = updateSchema.parse(await req.json());
  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: trip } = await svc
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (const act of body.activities) {
    const { error } = await svc
      .from("activities")
      .update({
        day_id: act.day_id,
        sort_order: act.sort_order,
        start_time: act.start_time,
        duration_minutes: act.duration_minutes,
        priority: act.priority,
        planning_note: act.planning_note,
        completed: act.completed,
        user_locked: act.user_locked ?? true,
        name: act.name,
      })
      .eq("id", act.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
