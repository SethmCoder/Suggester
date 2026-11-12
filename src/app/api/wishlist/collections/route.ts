import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWishlistUser, offlineJson } from "@/lib/wishlist/auth";
import { mapCollection } from "@/lib/wishlist/server";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = bodySchema.parse(await req.json());

  const { PLAN_LIMITS } = await import("@/lib/billing/limits");
  const { isProEntitled } = await import("@/lib/billing/entitlements");
  const { withProfileEntitlement } = await import("@/lib/billing/access");
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const pro = isProEntitled(
    await withProfileEntitlement((name) => jar.get(name)?.value, { id: auth.user.id, email: auth.user.email }),
  );
  if (!pro) {
    const { count } = await auth.supabase
      .from("wishlist_collections")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", auth.user.id);
    if ((count ?? 0) >= PLAN_LIMITS.free.wishlistCollections) {
      return NextResponse.json(
        {
          error: `Free includes ${PLAN_LIMITS.free.wishlistCollections} Collections. Upgrade to Plus for more.`,
          code: "plan_limit",
        },
        { status: 402 },
      );
    }
  }

  const { data, error } = await auth.supabase
    .from("wishlist_collections")
    .insert({
      owner_id: auth.user.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ collection: mapCollection(data) });
}

export async function PATCH(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = z
    .object({
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(500).nullable().optional(),
    })
    .parse(await req.json());
  const { data, error } = await auth.supabase
    .from("wishlist_collections")
    .update({
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .eq("owner_id", auth.user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ collection: mapCollection(data) });
}

export async function DELETE(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await auth.supabase
    .from("wishlist_collections")
    .delete()
    .eq("id", id)
    .eq("owner_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
