import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireFriendUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { supabase: null, user: null, offline: true as const };
    }
    return { supabase, user, offline: false as const };
  } catch {
    return { supabase: null, user: null, offline: true as const };
  }
}

export function friendsOfflineJson() {
  return NextResponse.json({ offline: true, error: "Sign in to use Friends." }, { status: 401 });
}
