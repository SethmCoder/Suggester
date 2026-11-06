"use client";

import { useEffect, useState } from "react";
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
  return (await res.json()) as BillingSnapshot & {
    entitled?: boolean;
    checkoutAvailable?: boolean;
  };
}

export default function PlanPage() {
  const [billing, setBilling] = useState<
    (BillingSnapshot & { entitled?: boolean; checkoutAvailable?: boolean }) | null
  >(null);
  const [busy, setBusy] = useState<"pro" | "free" | "portal" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    const cancelledCheckout = new URLSearchParams(window.location.search).get("checkout");
    async function load() {
      if (sessionId) {
        const confirmed = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!confirmed.ok) {
          const data = (await confirmed.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setNote(data.error ?? "Checkout could not be confirmed.");
        } else if (!cancelled) {
          setNote("Pro is active on this account.");
          window.history.replaceState(null, "", "/plan");
        }
      } else if (cancelledCheckout === "cancel" && !cancelled) {
        setNote("Checkout was cancelled. Pro was not turned on.");
      }
      const data = await syncPlan("sync");
      if (!cancelled) setBilling(data);
    }
    load().catch(() => {
      if (!cancelled) {
        setBilling({ plan: "free", used: 0, limit: 3, remaining: 3 });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    setBusy("pro");
    setNote(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setNote(data.error ?? "Checkout could not start.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("portal");
    setNote(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setNote(data.error ?? "The billing portal could not open.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(null);
    }
  }

  const entitled = Boolean(billing?.entitled);
  const checkout = Boolean(billing?.checkoutAvailable);

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
          <p className="mt-2 text-2xl font-bold text-[#080B3A]">$0</p>
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
            disabled={!entitled || !checkout || busy !== null}
            onClick={() => void manage()}
          >
            {entitled
              ? busy === "portal"
                ? "Opening…"
                : checkout
                  ? "Manage subscription"
                  : "Pro is on"
              : "Current plan"}
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
            disabled={entitled || busy !== null || !checkout}
            onClick={() => void subscribe()}
          >
            {entitled
              ? "Current plan"
              : busy === "pro"
                ? "Opening checkout…"
                : checkout
                  ? "Subscribe · $6.99/month"
                  : "Add a Stripe key to subscribe"}
          </Button>
        </section>
      </div>

      {note ? <p className="max-w-xl text-sm text-[#080B3A]">{note}</p> : null}
      <p className="max-w-xl text-xs leading-relaxed text-[#6B7280]">
        Pro is $6.99 a month through Stripe. A completed checkout turns Pro on for this account. Free stays at 3 trips, manual editing, the map, and 5 basic Trip Wizard requests a month.
      </p>
    </div>
  );
}
