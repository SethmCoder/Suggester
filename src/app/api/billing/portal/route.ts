import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/supabase/env";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/billing/stripe";

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
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const db = createServiceClient();
  const { data } = db
    ? await db
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const customerId = data?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer is saved for this account yet." },
      { status: 404 },
    );
  }

  const origin = req.headers.get("origin") || getSiteUrl();
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings`,
  });
  return NextResponse.json({ url: portal.url });
}
