import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sharedInboundAddress } from "@/lib/dreamer/mailbox";

/**
 * Returns the single shared forward address for Dreamer.
 * Matching is by the sender (From), not a per-user +token address.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const address = sharedInboundAddress();
  return NextResponse.json({
    address,
    matchBy: "from_email",
    hint: `Forward confirmation emails from ${user.email ?? "your account email"} to ${address}. Waypoint matches the sender to your account — no + codes.`,
    accountEmail: user.email ?? null,
  });
}
