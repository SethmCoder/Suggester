"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { countCreatedOfflineTrips } from "@/lib/offline/trips";
import type { BillingSnapshot } from "@/lib/billing/plans";
import { LIST_PRICES, planCopy } from "@/lib/billing/limits";

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
  const [busy, setBusy] = useState<"month" | "year" | "portal" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const free = planCopy(false);
  const pro = planCopy(true);

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
          setNote("Pro is active on this account. Saved trips and research stay available.");
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

  async function subscribe(interval: "month" | "year") {
    setBusy(interval);
    setNote(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
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
          Free covers year-round research basics. Pro unlocks personalized discovery depth,
          full itinerary generation, and expanded Trip Wizard. Expiration never deletes your
          saved trips or research.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            {free.title}
          </p>
          <p className="mt-2 text-2xl font-bold text-[#080B3A]">$0</p>
          <ul className="mt-4 space-y-2 text-sm text-[#1F2937]">
            {free.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
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
            {pro.title}
          </p>
          <p className="mt-2 text-2xl font-bold text-[#080B3A]">
            ${LIST_PRICES.proMonthlyUsd.toFixed(2)}
            <span className="ml-1 text-sm font-medium text-[#6B7280]">/ month</span>
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            or ${LIST_PRICES.proAnnualUsd.toFixed(2)} / year
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#1F2937]">
            {pro.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              disabled={entitled || busy !== null || !checkout}
              onClick={() => void subscribe("month")}
            >
              {entitled
                ? "Current plan"
                : busy === "month"
                  ? "Opening checkout…"
                  : checkout
                    ? `Subscribe · $${LIST_PRICES.proMonthlyUsd.toFixed(2)}/month`
                    : "Add a Stripe key to subscribe"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={entitled || busy !== null || !checkout}
              onClick={() => void subscribe("year")}
            >
              {busy === "year"
                ? "Opening checkout…"
                : `Annual · $${LIST_PRICES.proAnnualUsd.toFixed(2)}/year`}
            </Button>
          </div>
        </section>
      </div>

      {note ? <p className="max-w-xl text-sm text-[#080B3A]">{note}</p> : null}
      <p className="max-w-xl text-xs leading-relaxed text-[#6B7280]">
        Billing stays on the existing Stripe checkout. Prices are centralized in plan limits —
        ${LIST_PRICES.proMonthlyUsd.toFixed(2)} monthly or ${LIST_PRICES.proAnnualUsd.toFixed(2)} annual.
        Letting Pro lapse keeps your trips, wishlist, and future-trip research intact; only Pro
        generation features pause.
      </p>
    </div>
  );
}
