import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { reindexByChronology } from "@/lib/trips/activity-order";

const activitySchema = z.object({
  id: z.string(),
  day_id: z.string(),
  sort_order: z.number(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  duration_minutes: z.number().nullable().optional(),
  priority: z.string().nullable().optional(),
  planning_note: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  user_locked: z.boolean().optional(),
  name: z.string().optional(),
  address: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  place_id: z.string().nullable().optional(),
  source: z.string().optional(),
  /** When true, insert if the row does not exist yet. */
  upsert: z.boolean().optional(),
});

const updateSchema = z.object({
  activities: z.array(activitySchema),
  deletedIds: z.array(z.string()).optional(),
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

  const { data: days } = await svc
    .from("itinerary_days")
    .select("id")
    .eq("trip_id", tripId);
  const dayIds = new Set((days ?? []).map((d) => d.id));

  if (body.deletedIds?.length) {
    await svc.from("activities").delete().in("id", body.deletedIds);
  }

  const byDay = new Map<string, typeof body.activities>();
  for (const act of body.activities) {
    if (!dayIds.has(act.day_id)) {
      return NextResponse.json(
        { error: `Unknown day for activity ${act.id}` },
        { status: 400 },
      );
    }
    const list = byDay.get(act.day_id) ?? [];
    list.push(act);
    byDay.set(act.day_id, list);
  }

  for (const [, acts] of byDay) {
    const ordered = reindexByChronology(acts);
    for (const act of ordered) {
      const fields = {
        day_id: act.day_id,
        sort_order: act.sort_order,
        start_time: act.start_time ?? null,
        end_time: act.end_time ?? null,
        duration_minutes: act.duration_minutes ?? null,
        priority: act.priority ?? null,
        planning_note: act.planning_note ?? null,
        completed: act.completed ?? false,
        user_locked: act.user_locked ?? true,
        name: act.name,
        address: act.address ?? null,
        lat: act.lat ?? null,
        lng: act.lng ?? null,
        place_id: act.place_id ?? null,
        source: act.source ?? "user",
      };

      const { data: existing } = await svc
        .from("activities")
        .select("id")
        .eq("id", act.id)
        .maybeSingle();

      if (existing) {
        const { error } = await svc
          .from("activities")
          .update(fields)
          .eq("id", act.id);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      } else if (act.upsert || act.id.startsWith("stop-") || act.source === "user") {
        const { error } = await svc.from("activities").insert({
          id: act.id.match(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          )
            ? act.id
            : undefined,
          ...fields,
          name: act.name ?? "Stop",
        });
        if (error) {
          // Retry without custom id if UUID required
          const { error: err2 } = await svc.from("activities").insert({
            ...fields,
            name: act.name ?? "Stop",
          });
          if (err2) {
            return NextResponse.json({ error: err2.message }, { status: 400 });
          }
        }
      } else {
        return NextResponse.json(
          { error: `Activity ${act.id} not found` },
          { status: 400 },
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
