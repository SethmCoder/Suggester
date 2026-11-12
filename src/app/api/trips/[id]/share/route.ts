import { NextResponse } from "next/server";
import { z } from "zod";
import { friendsOfflineJson, requireFriendUser } from "@/lib/friends/auth";
import { findUserIdByEmail } from "@/lib/friends/lookup";
import { recordSocialActivity } from "@/lib/social/activity";

const postSchema = z.object({
  email: z.string().email().max(320),
  permission: z.enum(["view", "edit"]).optional(),
});

function shareToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await context.params;
  const auth = await requireFriendUser();
  if (auth.offline || !auth.supabase || !auth.user) return friendsOfflineJson();

  const { data: trip } = await auth.supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("trip_shares")
    .select("id, trip_id, share_token, permission, shared_with_user_id, created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ shares: data ?? [] });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await context.params;
  const auth = await requireFriendUser();
  if (auth.offline || !auth.supabase || !auth.user) return friendsOfflineJson();

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const { data: trip } = await auth.supabase
    .from("trips")
    .select("id, destination")
    .eq("id", tripId)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = await findUserIdByEmail(parsed.data.email);
  if (!target) {
    return NextResponse.json(
      { error: "No account with that email yet." },
      { status: 404 },
    );
  }
  if (target.id === auth.user.id) {
    return NextResponse.json({ error: "Share with someone else." }, { status: 400 });
  }

  const permission = parsed.data.permission ?? "view";

  const { data: existing } = await auth.supabase
    .from("trip_shares")
    .select("id")
    .eq("trip_id", tripId)
    .eq("shared_with_user_id", target.id)
    .maybeSingle();

  let shareRow;
  if (existing) {
    const { data, error } = await auth.supabase
      .from("trip_shares")
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
      .from("trip_shares")
      .insert({
        trip_id: tripId,
        share_token: shareToken(),
        permission,
        shared_with_user_id: target.id,
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
    type: "trip_shared",
    subjectType: "trip",
    subjectId: tripId,
    meta: {
      email: target.email,
      permission,
      destination: trip.destination,
    },
  });

  return NextResponse.json({ share: shareRow });
}
