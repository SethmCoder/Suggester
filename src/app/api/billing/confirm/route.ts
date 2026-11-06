import { NextResponse } from "next/server";
import { z } from "zod";
import { setSubscriptionTier } from "@/lib/billing/access";
import { ENTITLEMENT_COOKIE } from "@/lib/billing/entitlements";
import { getStripe } from "@/lib/billing/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  sessionId: z.string().min(8),
});

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Card checkout is not configured yet." },
      { status: 503 },
    );
  }

  const { sessionId } = bodySchema.parse(await req.json());
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const owner = session.client_reference_id || session.metadata?.userId;
  if (owner !== user.id || session.status !== "complete") {
    return NextResponse.json(
      { error: "That checkout is not a completed Pro subscription." },
      { status: 402 },
    );
  }

  const customerId = typeof session.customer === "string" ? session.customer : null;
  await setSubscriptionTier(user.id, "pro", customerId);

  const response = NextResponse.json({ ok: true, entitled: true });
  response.cookies.set(ENTITLEMENT_COOKIE, "pro", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
