import Stripe from "stripe";
import {
  PRO_PRICE_ANNUAL_USD,
  PRO_PRICE_USD,
  TRIP_PASS_PRICE_USD,
} from "@/lib/billing/entitlements";

export function checkoutConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export type ProCheckoutInterval = "month" | "year";

export function proPriceData(
  interval: ProCheckoutInterval = "month",
): Stripe.Checkout.SessionCreateParams.LineItem.PriceData {
  if (interval === "year") {
    return {
      currency: "usd",
      unit_amount: Math.round(PRO_PRICE_ANNUAL_USD * 100),
      recurring: { interval: "year" },
      product_data: { name: "Waypoint Plus (annual)" },
    };
  }
  return {
    currency: "usd",
    unit_amount: Math.round(PRO_PRICE_USD * 100),
    recurring: { interval: "month" },
    product_data: { name: "Waypoint Plus" },
  };
}

export function tripPassPriceData(): Stripe.Checkout.SessionCreateParams.LineItem.PriceData {
  const priceId = process.env.STRIPE_PRICE_TRIP_PASS?.trim();
  if (priceId) {
    // Prefer configured Stripe Price id when set (passed separately to line_items).
  }
  return {
    currency: "usd",
    unit_amount: Math.round(TRIP_PASS_PRICE_USD * 100),
    product_data: { name: "Waypoint Trip Pass" },
  };
}
