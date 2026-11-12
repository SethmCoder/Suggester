import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordSocialActivity(
  supabase: SupabaseClient,
  row: {
    actorId: string;
    type: string;
    subjectType?: string | null;
    subjectId?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  await supabase.from("social_activity").insert({
    actor_id: row.actorId,
    type: row.type,
    subject_type: row.subjectType ?? null,
    subject_id: row.subjectId ?? null,
    meta: row.meta ?? {},
  });
}
