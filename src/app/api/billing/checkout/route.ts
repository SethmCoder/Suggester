import { NextResponse } from "next/server";
import { z } from "zod";
import { getSiteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, proPriceData } from "@/lib/billing/stripe";

const bodySchema = z
  .object({
    interval: z.enum(["month", "year"]).optional(),
  })
  .optional();

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

  const parsed = bodySchema.parse(await req.json().catch(() => ({})));
  const interval = parsed?.interval ?? "month";
  const origin = req.headers.get("origin") || getSiteUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    line_items: [{ price_data: proPriceData(interval), quantity: 1 }],
    success_url: `${origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/settings?checkout=cancel`,
    metadata: { userId: user.id, interval },
    subscription_data: { metadata: { userId: user.id, interval } },
  });

  return NextResponse.json({ url: session.url });
}
