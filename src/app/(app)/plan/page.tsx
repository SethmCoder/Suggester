"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { countCreatedOfflineTrips } from "@/lib/offline/trips";
import type { BillingSnapshot } from "@/lib/billing/plans";

async function syncPlan(action: "sync" | "upgrade" | "downgrade") {
  const created = countCreatedOfflineTrips();
  const res = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, created }),
  });
  return (await res.json()) as BillingSnapshot;
}

export default function PlanPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [busy, setBusy] = useState<"pro" | "free" | null>(null);

  useEffect(() => {
    let cancelled = false;
    syncPlan("sync")
      .then((data) => {
        if (!cancelled) setBilling(data);
      })
      .catch(() => {
        if (!cancelled) {
          setBilling({ plan: "free", used: 0, limit: 3, remaining: 3 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function choose(action: "upgrade" | "downgrade") {
    setBusy(action === "upgrade" ? "pro" : "free");
    try {
      setBilling(await syncPlan(action));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const pro = billing?.plan === "pro";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">
          Plans
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[#6B7280]">
          Free plans a few trips with the standard planner. Pro removes the
          cap and uses the more detailed planner.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Free
          </p>
          <p className="mt-2 text-2xl font-bold text-[#080B3A]">€0</p>
          <ul className="mt-4 space-y-2 text-sm text-[#1F2937]">
            <li>3 trips</li>
            <li>Manual editing and the map</li>
            <li>5 basic Trip Wizard requests a month</li>
          </ul>
          <p className="mt-4 text-sm text-[#6B7280]">
            {billing
              ? `${billing.used} of ${billing.limit ?? 3} trips used`
              : "Checking trips…"}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            disabled={!pro || busy !== null}
            onClick={() => choose("downgrade")}
          >
            {pro ? (busy === "free" ? "Switching…" : "Use Free") : "Current plan"}
          </Button>
        </section>

        <section className="rounded-[16px] border border-[#0400FF]/30 bg-[#F5F7FF] p-6 shadow-[0_4px_20px_rgba(4,0,255,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0400FF]">
            Pro
          </p>
          <p className="mt-2 text-2xl font-bold text-[#080B3A]">
            $6.99
            <span className="ml-1 text-sm font-medium text-[#6B7280]">/ month</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#1F2937]">
            <li>Full multi-day itinerary generation</li>
            <li>Intelligence panel, optimize, and what-if</li>
            <li>Import a pasted plan and a higher AI allowance</li>
          </ul>
          <Button
            type="button"
            className="mt-4"
            disabled
          >
            Checkout is not taking cards yet
          </Button>
        </section>
      </div>

      <p className="max-w-xl text-xs leading-relaxed text-[#6B7280]">
        Pro is $6.99 a month. Checkout is not taking cards yet, so this page cannot turn Pro on. Free stays at 3 trips, manual editing, the map, and 5 basic Trip Wizard requests a month.
      </p>
    </div>
  );
}
