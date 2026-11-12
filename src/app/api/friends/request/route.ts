import { NextResponse } from "next/server";
import { z } from "zod";
import { friendsOfflineJson, requireFriendUser } from "@/lib/friends/auth";
import { findUserIdByEmail } from "@/lib/friends/lookup";
import { recordSocialActivity } from "@/lib/social/activity";

const bodySchema = z.object({
  email: z.string().email().max(320),
});

export async function POST(req: Request) {
  const auth = await requireFriendUser();
  if (auth.offline || !auth.supabase || !auth.user) return friendsOfflineJson();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const target = await findUserIdByEmail(parsed.data.email);
  if (!target) {
    return NextResponse.json(
      { error: "No account with that email yet." },
      { status: 404 },
    );
  }
  if (target.id === auth.user.id) {
    return NextResponse.json({ error: "You cannot add yourself." }, { status: 400 });
  }

  const { data: existing } = await auth.supabase
    .from("friendships")
    .select("id, status, requester_id, addressee_id")
    .or(
      `and(requester_id.eq.${auth.user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${auth.user.id})`,
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") {
      return NextResponse.json({ error: "Already friends." }, { status: 409 });
    }
    if (existing.status === "pending") {
      return NextResponse.json({ error: "Request already pending." }, { status: 409 });
    }
    const { data: renewed, error: renewErr } = await auth.supabase
      .from("friendships")
      .update({
        status: "pending",
        requester_id: auth.user.id,
        addressee_id: target.id,
      })
      .eq("id", existing.id)
      .select("id, status, requester_id, addressee_id, created_at")
      .single();
    if (renewErr) {
      return NextResponse.json({ error: renewErr.message }, { status: 400 });
    }
    await recordSocialActivity(auth.supabase, {
      actorId: auth.user.id,
      type: "friend_request",
      subjectType: "user",
      subjectId: target.id,
      meta: { email: target.email },
    });
    return NextResponse.json({ friendship: renewed });
  }

  const { data, error } = await auth.supabase
    .from("friendships")
    .insert({
      requester_id: auth.user.id,
      addressee_id: target.id,
      status: "pending",
    })
    .select("id, status, requester_id, addressee_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordSocialActivity(auth.supabase, {
    actorId: auth.user.id,
    type: "friend_request",
    subjectType: "user",
    subjectId: target.id,
    meta: { email: target.email },
  });

  return NextResponse.json({ friendship: data });
}
