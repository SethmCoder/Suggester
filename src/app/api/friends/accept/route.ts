import { NextResponse } from "next/server";
import { z } from "zod";
import { friendsOfflineJson, requireFriendUser } from "@/lib/friends/auth";
import { recordSocialActivity } from "@/lib/social/activity";

const bodySchema = z.object({
  friendshipId: z.string().uuid(),
});

export async function POST(req: Request) {
  const auth = await requireFriendUser();
  if (auth.offline || !auth.supabase || !auth.user) return friendsOfflineJson();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: row } = await auth.supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", parsed.data.friendshipId)
    .maybeSingle();

  if (!row || row.addressee_id !== auth.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "pending") {
    return NextResponse.json({ error: "Request is no longer pending." }, { status: 409 });
  }

  const { data, error } = await auth.supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", row.id)
    .select("id, status, requester_id, addressee_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordSocialActivity(auth.supabase, {
    actorId: auth.user.id,
    type: "friend_accepted",
    subjectType: "user",
    subjectId: row.requester_id,
  });

  return NextResponse.json({ friendship: data });
}
