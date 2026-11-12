import { NextResponse } from "next/server";
import { z } from "zod";
import { friendsOfflineJson, requireFriendUser } from "@/lib/friends/auth";
import { findUserIdByEmail } from "@/lib/friends/lookup";
import { recordSocialActivity } from "@/lib/social/activity";

const postSchema = z.object({
  email: z.string().email().max(320),
  permission: z.enum(["view", "edit"]).optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireFriendUser();
  if (auth.offline || !auth.supabase || !auth.user) return friendsOfflineJson();

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const { data: plan } = await auth.supabase
    .from("future_trips")
    .select("id, destination, title")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = await findUserIdByEmail(parsed.data.email);
  if (!target) {
    return NextResponse.json(
      { error: "No account with that email yet." },
      { status: 404 },
    );
  }

  const permission = parsed.data.permission ?? "view";

  const { data: existing } = await auth.supabase
    .from("future_trip_shares")
    .select("id")
    .eq("future_trip_id", id)
    .eq("shared_with_user_id", target.id)
    .maybeSingle();

  let shareRow;
  if (existing) {
    const { data, error } = await auth.supabase
      .from("future_trip_shares")
      .update({ permission })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    shareRow = data;
  } else {
    const { data, error } = await auth.supabase
      .from("future_trip_shares")
      .insert({
        future_trip_id: id,
        owner_id: auth.user.id,
        shared_with_user_id: target.id,
        permission,
      })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    shareRow = data;
  }

  await recordSocialActivity(auth.supabase, {
    actorId: auth.user.id,
    type: "future_trip_shared",
    subjectType: "future_trip",
    subjectId: id,
    meta: {
      email: target.email,
      permission,
      label: plan.title ?? plan.destination,
    },
  });

  return NextResponse.json({ share: shareRow });
}
