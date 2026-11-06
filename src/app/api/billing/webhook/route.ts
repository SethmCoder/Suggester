import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { setSubscriptionTier } from "@/lib/billing/access";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/billing/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.userId;
    const customerId = typeof session.customer === "string" ? session.customer : null;
    if (userId) await setSubscriptionTier(userId, "pro", customerId);
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : null;
    const userId = subscription.metadata?.userId || (await userIdForCustomer(customerId));
    const active = subscription.status === "active" || subscription.status === "trialing";
    if (userId) await setSubscriptionTier(userId, active ? "pro" : "free", customerId);
  }

  return NextResponse.json({ received: true });
}

async function userIdForCustomer(customerId: string | null) {
  if (!customerId) return null;
  const db = createServiceClient();
  if (!db) return null;
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}
