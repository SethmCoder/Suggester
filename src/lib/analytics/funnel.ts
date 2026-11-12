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

  const signedUpEvents = new Set<string>();
  const wizardOpenedAll = new Set<string>();
  const generateClickedAll = new Set<string>();
  const tripPlannedAll = new Set<string>();
  const tripPlannedCount = new Map<string, number>();
  const signupAt = new Map<string, number>();

  for (const row of rows ?? []) {
    const uid = row.user_id as string | null;
    if (!uid) continue;
    const t = Date.parse(row.created_at as string);
    if (row.event_name === AnalyticsEvent.SignupCompleted) {
      signedUpEvents.add(uid);
      const prev = signupAt.get(uid);
      if (prev == null || t < prev) signupAt.set(uid, t);
    }
    if (row.event_name === AnalyticsEvent.WizardOpened) {
      wizardOpenedAll.add(uid);
    }
    if (row.event_name === AnalyticsEvent.GenerateClicked) {
      generateClickedAll.add(uid);
    }
    if (row.event_name === AnalyticsEvent.TripPlanned) {
      tripPlannedAll.add(uid);
      tripPlannedCount.set(uid, (tripPlannedCount.get(uid) ?? 0) + 1);
    }
  }

  let cohortIds: string[] = [];
  let cohortSource: FunnelStats["cohortSource"] = "events";
  let fallback: FunnelStats["fallback"];

  try {
    const { data: listed } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const users = (listed?.users ?? []).filter(
      (u) => Date.parse(u.created_at) >= Date.parse(sinceIso),
    );
    cohortIds = users.map((u) => u.id);
    cohortSource = "auth";
    for (const u of users) {
      const created = Date.parse(u.created_at);
      if (!signupAt.has(u.id) || created < (signupAt.get(u.id) ?? Infinity)) {
        signupAt.set(u.id, created);
      }
    }
    // Prefer auth; if the admin list is empty but events exist, stay honest.
    if (!cohortIds.length && signedUpEvents.size) {
      cohortIds = [...signedUpEvents];
      cohortSource = "events";
    }

    let withTrip = 0;
    if (cohortIds.length) {
      const { data: trips } = await svc
        .from("trips")
        .select("owner_id")
        .in("owner_id", cohortIds);
      withTrip = new Set((trips ?? []).map((t) => t.owner_id as string)).size;
    }
    fallback = {
      usersCreated: cohortSource === "auth" ? users.length : signedUpEvents.size,
      usersWithTrip: withTrip,
      rate:
        (cohortSource === "auth" ? users.length : signedUpEvents.size) === 0
          ? 0
          : withTrip /
            (cohortSource === "auth" ? users.length : signedUpEvents.size),
    };
  } catch {
    cohortIds = [...signedUpEvents];
    cohortSource = "events";
    fallback = undefined;
  }

  const cohort = new Set(cohortIds);
  const signedUp = cohort.size;

  const inCohort = (uid: string) => cohort.has(uid);
  const wizardOpened = [...wizardOpenedAll].filter(inCohort).length;
  const generateClicked = [...generateClickedAll].filter(inCohort).length;

  const tripCountByOwner = new Map<string, number>();
  if (cohortIds.length) {
    const { data: trips } = await svc
      .from("trips")
      .select("owner_id")
      .in("owner_id", cohortIds);
    for (const row of trips ?? []) {
      const oid = row.owner_id as string;
      tripCountByOwner.set(oid, (tripCountByOwner.get(oid) ?? 0) + 1);
    }
  }

  let signedUpThenPlanned = 0;
  let secondTripUsers = 0;
  for (const uid of cohortIds) {
    const owned = tripCountByOwner.get(uid) ?? 0;
    const plannedEvents = tripPlannedCount.get(uid) ?? 0;
    const hasFirst = owned >= 1 || plannedEvents >= 1 || tripPlannedAll.has(uid);
    if (hasFirst) signedUpThenPlanned += 1;
    if (owned >= 2 || plannedEvents >= 2) secondTripUsers += 1;
  }

  // Event-only fallback when trips query was empty but TripPlanned after signup exists.
  if (cohortSource === "events" && signedUpThenPlanned === 0 && signedUp) {
    const plannedAfter = new Set<string>();
    for (const row of rows ?? []) {
      if (row.event_name !== AnalyticsEvent.TripPlanned) continue;
      const uid = row.user_id as string | null;
      if (!uid || !cohort.has(uid)) continue;
      const signed = signupAt.get(uid);
      const planned = Date.parse(row.created_at as string);
      if (signed != null && Number.isFinite(planned) && planned >= signed) {
        plannedAfter.add(uid);
      }
    }
    signedUpThenPlanned = plannedAfter.size;
  }

  const tripPlanned = Math.max(
    [...tripPlannedAll].filter(inCohort).length,
    signedUpThenPlanned,
  );

  const signupToPlanRate =
    signedUp === 0 ? 0 : signedUpThenPlanned / signedUp;
  const secondTripRate = signedUp === 0 ? 0 : secondTripUsers / signedUp;

  return {
    days,
    signedUp,
    cohortSource,
    wizardOpened,
    generateClicked,
    tripPlanned,
    signedUpThenPlanned,
    signupToPlanRate,
    secondTripUsers,
    secondTripRate,
    fallback,
  };
}
