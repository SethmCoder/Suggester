import { NextResponse } from "next/server";
import { z } from "zod";
import { getSiteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, tripPassPriceData } from "@/lib/billing/stripe";
import { tripPassExpiresAtFromEndDate } from "@/lib/billing/premium";
import { TRIP_PASS_PRICE_USD } from "@/lib/billing/entitlements";

const bodySchema = z.object({
  tripId: z.string().uuid(),
});

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "Trip Pass checkout isn't available yet.",
      },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before purchasing a Trip Pass." },
      { status: 401 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "tripId is required." }, { status: 400 });
  }

  const db = createServiceClient() ?? supabase;
  const { data: trip } = await db
    .from("trips")
    .select("id, owner_id, end_date, destination")
    .eq("id", parsed.data.tripId)
    .maybeSingle();

  if (!trip || trip.owner_id !== user.id) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const expiresDate = tripPassExpiresAtFromEndDate(trip.end_date);
  const origin = req.headers.get("origin") || getSiteUrl();
  const priceId = process.env.STRIPE_PRICE_TRIP_PASS?.trim();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    line_items: priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{ price_data: tripPassPriceData(), quantity: 1 }],
    success_url: `${origin}/trips/${trip.id}?trip_pass=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/trips/${trip.id}?trip_pass=cancel`,
    metadata: {
      userId: user.id,
      tripId: trip.id,
      product: "trip_pass",
      expiresDate,
    },
  });

  return NextResponse.json({
    url: session.url,
    priceUsd: TRIP_PASS_PRICE_USD,
    expiresDate,
  });
}
