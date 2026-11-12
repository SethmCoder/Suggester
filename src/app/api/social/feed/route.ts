import { NextResponse } from "next/server";
import type { FriendProfile, SocialActivityItem } from "@/lib/friends/types";
import { friendsOfflineJson, requireFriendUser } from "@/lib/friends/auth";

export async function GET(req: Request) {
  const auth = await requireFriendUser();
  if (auth.offline || !auth.supabase || !auth.user) return friendsOfflineJson();

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "40"), 80);

  const { data, error } = await auth.supabase
    .from("social_activity")
    .select("id, actor_id, type, subject_type, subject_id, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const actorIds = [...new Set((data ?? []).map((row) => row.actor_id))];
  const profiles = new Map<string, FriendProfile>();
  if (actorIds.length) {
    const { data: profileRows } = await auth.supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", actorIds);
    for (const p of profileRows ?? []) {
      profiles.set(p.id, {
        id: p.id,
        displayName: p.display_name ?? p.username ?? null,
        email: null,
      });
    }
  }

  const items: SocialActivityItem[] = (data ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    type: row.type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    meta: (row.meta as Record<string, unknown>) ?? {},
    createdAt: row.created_at ?? new Date().toISOString(),
    actor: profiles.get(row.actor_id),
  }));

  return NextResponse.json({ items });
}
