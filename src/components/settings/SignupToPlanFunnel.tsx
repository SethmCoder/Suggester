"use client";

import { useEffect, useState } from "react";
import type { FunnelStats } from "@/lib/analytics/events";

function pct(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${Math.round(rate * 1000) / 10}%`;
}

export function SignupToPlanFunnel() {
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics/funnel?days=30")
      .then(async (res) => {
        if (res.status === 403) {
          if (!cancelled) setHidden(true);
          return null;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || "Could not load funnel");
        }
        return (await res.json()) as FunnelStats;
      })
      .then((data) => {
        if (!cancelled && data) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden) return null;

  return (
    <section className="rounded-2xl border border-[#E1E5F0] bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Product funnel</h2>
      <p className="mt-1 text-sm text-[#6B7280]">
        Last 30 days — accounts created → first trip planned → second trip.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-[#DC2626]">{error}</p>
      ) : !stats ? (
        <p className="mt-3 text-sm text-[#6B7280]">Loading…</p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-3xl font-semibold tracking-tight text-[#0F172A]">
            {pct(stats.signupToPlanRate)}
            <span className="ml-2 text-base font-medium text-[#6B7280]">
              signup → first plan
            </span>
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dt className="text-[#6B7280]">
                {stats.cohortSource === "auth"
                  ? "Accounts created"
                  : "Signed up (events)"}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">{stats.signedUp}</dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Opened wizard</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {stats.wizardOpened}
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Hit generate</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {stats.generateClicked}
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">First trip</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {stats.signedUpThenPlanned}
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Second trip</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {stats.secondTripUsers}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-[#6B7280]">
            {stats.signedUpThenPlanned} of {stats.signedUp} new accounts planned
            a first trip; {stats.secondTripUsers} planned a second (
            {pct(stats.secondTripRate)} of signups).
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Cohort:{" "}
            {stats.cohortSource === "auth"
              ? "auth.users created in window (primary)"
              : "signup_completed events (auth list unavailable)"}
            . Wizard / generate counts are unique cohort members with those
            events in-window.
          </p>
        </div>
      )}
    </section>
  );
}
