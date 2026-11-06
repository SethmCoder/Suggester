import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, proPriceData } from "@/lib/billing/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Card checkout is not configured yet." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before subscribing." },
      { status: 401 },
    );
  }

  const origin = req.headers.get("origin") || getSiteUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    line_items: [{ price_data: proPriceData(), quantity: 1 }],
    success_url: `${origin}/plan?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/plan?checkout=cancel`,
    metadata: { userId: user.id },
    subscription_data: { metadata: { userId: user.id } },
  });

  return NextResponse.json({ url: session.url });
}
