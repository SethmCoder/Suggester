import { ENTITLEMENT_COOKIE } from "@/lib/billing/entitlements";
import { emailGrantedPro } from "@/lib/billing/pro-grant";
import { createServiceClient } from "@/lib/supabase/server";

type Getter = (name: string) => string | undefined;

export type EntitlementUser = {
  id?: string | null;
  email?: string | null;
};

/** A paid or allowlisted profile counts as Pro even without the entitlement cookie. */
export async function withProfileEntitlement(
  get: Getter,
  userIdOrUser?: string | null | EntitlementUser,
): Promise<Getter> {
  const user: EntitlementUser =
    typeof userIdOrUser === "string" || userIdOrUser == null
      ? { id: userIdOrUser }
      : userIdOrUser;

  let pro = emailGrantedPro(user.email);
  if (!pro && user.id) {
    const db = createServiceClient();
    if (db) {
      const { data } = await db
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
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
  if (!db) return { ok: false as const, error: "Service role is not configured" };
  const row: Record<string, string> = {
    id: userId,
    subscription_tier: tier,
    subscription_period: tier === "pro" ? "month" : "",
  };
  if (customerId) row.stripe_customer_id = customerId;
  const { error } = await db.from("profiles").upsert(row);
  if (error && customerId) {
    const retry = await db.from("profiles").upsert({
      id: userId,
      subscription_tier: tier,
      subscription_period: tier === "pro" ? "month" : "",
    });
    if (retry.error) return { ok: false as const, error: retry.error.message };
    return { ok: true as const };
  }
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const db = createServiceClient();
  if (!db) return null;
  const normalized = email.trim().toLowerCase();
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error || !data?.users) return null;
  const match = data.users.find(
    (user) => user.email?.trim().toLowerCase() === normalized,
  );
  return match?.id ?? null;
}
