import Stripe from "stripe";
import { PRO_PRICE_USD } from "@/lib/billing/entitlements";

export function checkoutConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export function proPriceData(): Stripe.Checkout.SessionCreateParams.LineItem.PriceData {
  return {
    currency: "usd",
    unit_amount: Math.round(PRO_PRICE_USD * 100),
    recurring: { interval: "month" },
    product_data: { name: "Waypoint Pro" },
  };
}
