import { ENTITLEMENT_COOKIE } from "@/lib/billing/entitlements";
import { createServiceClient } from "@/lib/supabase/server";

type Getter = (name: string) => string | undefined;

/** A paid profile counts as Pro even when this browser has no entitlement cookie. */
export async function withProfileEntitlement(
  get: Getter,
  userId: string | null | undefined,
): Promise<Getter> {
  let pro = false;
  if (userId) {
    const db = createServiceClient();
    if (db) {
      const { data } = await db
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .maybeSingle();
      pro = data?.subscription_tier === "pro";
    }
  }
  return (name) => {
    if (pro && name === ENTITLEMENT_COOKIE) return "pro";
    return get(name);
  };
}

export async function setSubscriptionTier(
  userId: string,
  tier: "free" | "pro",
  customerId?: string | null,
) {
  const db = createServiceClient();
  if (!db) return;
  const row: Record<string, string> = {
    id: userId,
    subscription_tier: tier,
    subscription_period: tier === "pro" ? "month" : "",
  };
  if (customerId) row.stripe_customer_id = customerId;
  const { error } = await db.from("profiles").upsert(row);
  if (error && customerId) {
    await db.from("profiles").upsert({
      id: userId,
      subscription_tier: tier,
      subscription_period: tier === "pro" ? "month" : "",
    });
  }
}
