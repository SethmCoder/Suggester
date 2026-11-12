import { NextResponse } from "next/server";
import type { FriendshipRow, FriendProfile } from "@/lib/friends/types";
import { friendsOfflineJson, requireFriendUser } from "@/lib/friends/auth";

function mapFriend(row: {
  id: string;
  display_name: string | null;
  username: string | null;
}): FriendProfile {
  return {
    id: row.id,
    displayName: row.display_name ?? row.username ?? null,
    email: null,
  };
}

export async function GET() {
  const auth = await requireFriendUser();
  if (auth.offline || !auth.supabase || !auth.user) return friendsOfflineJson();

  const { data, error } = await auth.supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .or(`requester_id.eq.${auth.user.id},addressee_id.eq.${auth.user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = data ?? [];
  const userIds = new Set<string>();
  for (const row of rows) {
    userIds.add(row.requester_id);
    userIds.add(row.addressee_id);
  }

  const profiles = new Map<string, FriendProfile>();
  if (userIds.size) {
    const { data: profileRows } = await auth.supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", [...userIds]);
    for (const p of profileRows ?? []) {
      profiles.set(p.id, mapFriend(p));
    }
  }

  const friendships: FriendshipRow[] = rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status as FriendshipRow["status"],
    createdAt: row.created_at ?? new Date().toISOString(),
    requester: profiles.get(row.requester_id),
    addressee: profiles.get(row.addressee_id),
  }));

  const accepted = friendships.filter((f) => f.status === "accepted");
  const pendingIncoming = friendships.filter(
    (f) => f.status === "pending" && f.addresseeId === auth.user!.id,
  );
  const pendingOutgoing = friendships.filter(
    (f) => f.status === "pending" && f.requesterId === auth.user!.id,
  );

  return NextResponse.json({
    viewerId: auth.user.id,
    friendships,
    friends: accepted,
    pendingIncoming,
    pendingOutgoing,
  });
}
