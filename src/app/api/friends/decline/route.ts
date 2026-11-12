import { NextResponse } from "next/server";
import { z } from "zod";
import { friendsOfflineJson, requireFriendUser } from "@/lib/friends/auth";

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
    .select("id, addressee_id, status")
    .eq("id", parsed.data.friendshipId)
    .maybeSingle();

  if (!row || row.addressee_id !== auth.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("friendships")
    .update({ status: "declined" })
    .eq("id", row.id)
    .select("id, status, requester_id, addressee_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ friendship: data });
}
