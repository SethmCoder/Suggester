import type { SupabaseClient } from "@supabase/supabase-js";
import { AnalyticsEvent, type FunnelStats } from "./events";

export async function computeSignupToPlanFunnel(
  svc: SupabaseClient,
  days = 30,
): Promise<FunnelStats> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.max(1, days));
  const sinceIso = since.toISOString();

  const { data: rows } = await svc
    .from("analytics_events")
    .select("user_id, event_name, created_at")
    .gte("created_at", sinceIso)
    .in("event_name", [
      AnalyticsEvent.SignupCompleted,
      AnalyticsEvent.WizardOpened,
      AnalyticsEvent.GenerateClicked,
      AnalyticsEvent.TripPlanned,
    ]);

  const signedUp = new Set<string>();
  const wizardOpened = new Set<string>();
  const generateClicked = new Set<string>();
  const tripPlanned = new Set<string>();
  const signupAt = new Map<string, number>();

  for (const row of rows ?? []) {
    const uid = row.user_id as string | null;
    if (!uid) continue;
    const t = Date.parse(row.created_at as string);
    if (row.event_name === AnalyticsEvent.SignupCompleted) {
      signedUp.add(uid);
      const prev = signupAt.get(uid);
      if (prev == null || t < prev) signupAt.set(uid, t);
    }
    if (row.event_name === AnalyticsEvent.WizardOpened) wizardOpened.add(uid);
    if (row.event_name === AnalyticsEvent.GenerateClicked) {
      generateClicked.add(uid);
    }
    if (row.event_name === AnalyticsEvent.TripPlanned) tripPlanned.add(uid);
  }

  let signedUpThenPlanned = 0;
  if (signedUp.size) {
    const { data: laterTrips } = await svc
      .from("analytics_events")
      .select("user_id, created_at")
      .eq("event_name", AnalyticsEvent.TripPlanned)
      .in("user_id", [...signedUp]);
    const plannedAfter = new Set<string>();
    for (const row of laterTrips ?? []) {
      const uid = row.user_id as string;
      const signed = signupAt.get(uid);
      const planned = Date.parse(row.created_at as string);
      if (signed != null && Number.isFinite(planned) && planned >= signed) {
        plannedAfter.add(uid);
      }
    }
    signedUpThenPlanned = plannedAfter.size;
  }

  const signupToPlanRate =
    signedUp.size === 0 ? 0 : signedUpThenPlanned / signedUp.size;

  // Fallback: auth users created in window vs those with a trips row.
  let fallback: FunnelStats["fallback"];
  try {
    const { data: listed } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const users = (listed?.users ?? []).filter(
      (u) => Date.parse(u.created_at) >= Date.parse(sinceIso),
    );
    const userIds = users.map((u) => u.id);
    let withTrip = 0;
    if (userIds.length) {
      const { data: trips } = await svc
        .from("trips")
        .select("owner_id")
        .in("owner_id", userIds);
      withTrip = new Set((trips ?? []).map((t) => t.owner_id as string)).size;
    }
    fallback = {
      usersCreated: users.length,
      usersWithTrip: withTrip,
      rate: users.length === 0 ? 0 : withTrip / users.length,
    };
  } catch {
    fallback = undefined;
  }

  return {
    days,
    signedUp: signedUp.size,
    wizardOpened: wizardOpened.size,
    generateClicked: generateClicked.size,
    tripPlanned: tripPlanned.size,
    signedUpThenPlanned,
    signupToPlanRate,
    fallback,
  };
}
