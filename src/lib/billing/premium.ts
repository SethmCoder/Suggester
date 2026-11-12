import {
  TRIP_PASS_GRACE_DAYS,
  isProEntitled,
} from "@/lib/billing/entitlements";
import { withProfileEntitlement } from "@/lib/billing/access";
import { addCalendarDays } from "@/lib/trips/dates";
import { createServiceClient } from "@/lib/supabase/server";

type Getter = (name: string) => string | undefined;

/**
 * Central premium check: Plus subscription OR an unexpired Trip Pass for this trip.
 */
export async function hasPremiumAccess(input: {
  userId: string;
  email?: string | null;
  tripId?: string | null;
  cookieGet?: Getter;
}): Promise<{
  premium: boolean;
  via: "plus" | "trip_pass" | "none";
  tripPassExpiresAt?: string | null;
}> {
  const get = await withProfileEntitlement(
    input.cookieGet ?? (() => undefined),
    { id: input.userId, email: input.email },
  );
  if (isProEntitled(get)) {
    return { premium: true, via: "plus" };
  }

  if (!input.tripId) {
    return { premium: false, via: "none" };
  }

  const db = createServiceClient();
  if (!db) return { premium: false, via: "none" };

  const nowIso = new Date().toISOString();
  const { data } = await db
    .from("trip_passes")
    .select("expires_at")
    .eq("user_id", input.userId)
    .eq("trip_id", input.tripId)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.expires_at) {
    return {
      premium: true,
      via: "trip_pass",
      tripPassExpiresAt: data.expires_at,
    };
  }

  return { premium: false, via: "none" };
}

export function tripPassExpiresAtFromEndDate(endDate: string | null | undefined) {
  const end = (endDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    // Undated trips: configurable max — default 180 days from purchase.
    const maxDays = Number(process.env.TRIP_PASS_MAX_DAYS_UNDATED || 180);
    return addCalendarDays(
      new Date().toISOString().slice(0, 10),
      Math.max(30, Math.min(730, maxDays)),
    );
  }
  return addCalendarDays(end, TRIP_PASS_GRACE_DAYS);
}

export async function grantTripPass(input: {
  userId: string;
  tripId: string;
  expiresAt: string;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  if (!db) return { ok: false, error: "Service role is not configured" };

  if (input.checkoutSessionId) {
    const { data: existing } = await db
      .from("trip_passes")
      .select("id")
      .eq("stripe_checkout_session_id", input.checkoutSessionId)
      .maybeSingle();
    if (existing?.id) return { ok: true };
  }

  const { error } = await db.from("trip_passes").insert({
    user_id: input.userId,
    trip_id: input.tripId,
    expires_at: `${input.expiresAt}T23:59:59.000Z`,
    stripe_checkout_session_id: input.checkoutSessionId ?? null,
    stripe_payment_intent_id: input.paymentIntentId ?? null,
  });

  if (error) {
    // Unique session → idempotent success
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
