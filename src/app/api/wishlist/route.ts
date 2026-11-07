import { NextResponse } from "next/server";
import { requireWishlistUser, offlineJson } from "@/lib/wishlist/auth";
import { fetchWishlist } from "@/lib/wishlist/server";

export async function GET() {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) {
    return offlineJson({ collections: [], items: [] });
  }
  try {
    const data = await fetchWishlist(auth.supabase, auth.user.id);
    return NextResponse.json({ offline: false, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wishlist unavailable";
    return NextResponse.json(
      { offline: true, collections: [], items: [], error: message },
      { status: 200 },
    );
  }
}
