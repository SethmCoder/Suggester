"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DemoCheckout } from "@/components/billing/DemoCheckout";
import { countCreatedOfflineTrips } from "@/lib/offline/trips";
import type { BillingSnapshot } from "@/lib/billing/plans";
import { LIST_PRICES, planCopy } from "@/lib/billing/limits";
import type { DemoCheckoutInterval } from "@/lib/billing/demo-checkout";

type BillingView = BillingSnapshot & {
  entitled?: boolean;
  checkoutAvailable?: boolean;
  signedIn?: boolean;
  selfGrantAvailable?: boolean;
  allowlisted?: boolean;
};

async function syncPlan(action: "sync" | "upgrade" | "downgrade") {
  const created = countCreatedOfflineTrips();
  const res = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, created }),
  });
  return (await res.json()) as BillingView;
}

export default function PlanPage() {
  const [billing, setBilling] = useState<BillingView | null>(null);
  const [busy, setBusy] = useState<"month" | "year" | "portal" | "grant" | null>(
    null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [grantSecret, setGrantSecret] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoInterval, setDemoInterval] =
    useState<DemoCheckoutInterval>("month");
  const free = planCopy(false);
  const pro = planCopy(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const cancelledCheckout = params.get("checkout");
    const demoIntervalParam = params.get("interval");
    async function load() {
      if (sessionId) {
        const confirmed = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!confirmed.ok) {
          const data = (await confirmed.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!cancelled) setNote(data.error ?? "Checkout could not be confirmed.");
        } else if (!cancelled) {
          setNote(
            "Pro is active on this account. Saved trips and research stay available.",
          );
          window.history.replaceState(null, "", "/plan");
        }
      } else if (cancelledCheckout === "cancel" && !cancelled) {
        setNote("Checkout was cancelled. Pro was not turned on.");
      } else if (cancelledCheckout === "demo" && !cancelled) {
        setDemoInterval(demoIntervalParam === "year" ? "year" : "month");
        setDemoOpen(true);
        window.history.replaceState(null, "", "/plan");
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

  function openDemo(interval: DemoCheckoutInterval) {
    setDemoInterval(interval);
    setDemoOpen(true);
    setNote(null);
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

  async function unlockThisAccount() {
    setBusy("grant");
    setNote(null);
    try {
      const res = await fetch("/api/billing/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          self: true,
          tier: "pro",
          secret: grantSecret.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; entitled?: boolean };
      if (!res.ok) {
        setNote(data.error ?? "Could not unlock Pro on this account.");
        return;
      }
      setNote("Pro is active on this signed-in account.");
      setGrantSecret("");
      setBilling(await syncPlan("sync"));
    } finally {
      setBusy(null);
    }
  }

  const entitled = Boolean(billing?.entitled);
  const checkout = Boolean(billing?.checkoutAvailable);
  const canTrySelfGrant =
    Boolean(billing?.signedIn) && !entitled && !checkout;

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
            {checkout ? (
              <>
                <Button
                  type="button"
                  disabled={entitled || busy !== null}
                  onClick={() => void subscribe("month")}
                >
                  {entitled
                    ? "Current plan"
                    : busy === "month"
                      ? "Opening checkout…"
                      : `Subscribe · $${LIST_PRICES.proMonthlyUsd.toFixed(2)}/month`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={entitled || busy !== null}
                  onClick={() => void subscribe("year")}
                >
                  {busy === "year"
                    ? "Opening checkout…"
                    : `Annual · $${LIST_PRICES.proAnnualUsd.toFixed(2)}/year`}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  disabled={entitled}
                  onClick={() => openDemo("month")}
                >
                  {entitled
                    ? "Current plan"
                    : `Preview checkout · $${LIST_PRICES.proMonthlyUsd.toFixed(2)}/month`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={entitled}
                  onClick={() => openDemo("year")}
                >
                  Preview annual · ${LIST_PRICES.proAnnualUsd.toFixed(2)}/year
                </Button>
              </>
            )}
            <button
              type="button"
              className="pt-1 text-left text-xs font-semibold text-[#0400FF] underline-offset-2 hover:underline"
              onClick={() => openDemo(demoInterval)}
            >
              {checkout
                ? "Preview the checkout flow without Stripe"
                : "Demo only — opens a fake checkout, no charge"}
            </button>
          </div>
        </section>
      </div>

      {canTrySelfGrant ? (
        <section className="rounded-[16px] border border-dashed border-[#0400FF]/35 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#080B3A]">
            Unlock Pro on this account
          </h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            For a single signed-in account without Stripe: enable{" "}
            <code className="text-xs">WAYPOINT_ALLOW_SELF_PRO_GRANT=1</code>, put
            your email in <code className="text-xs">WAYPOINT_PRO_EMAILS</code>, or
            enter <code className="text-xs">WAYPOINT_GRANT_SECRET</code> below.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="password"
              value={grantSecret}
              onChange={(e) => setGrantSecret(e.target.value)}
              placeholder="Grant secret (optional)"
              className="h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3.5 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35 sm:max-w-xs"
            />
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void unlockThisAccount()}
            >
              {busy === "grant" ? "Unlocking…" : "Unlock Pro for me"}
            </Button>
          </div>
        </section>
      ) : null}

      {note ? <p className="max-w-xl text-sm text-[#080B3A]">{note}</p> : null}
      <p className="max-w-xl text-xs leading-relaxed text-[#6B7280]">
        {checkout
          ? `Live billing uses Stripe Checkout at $${LIST_PRICES.proMonthlyUsd.toFixed(2)} monthly or $${LIST_PRICES.proAnnualUsd.toFixed(2)} annual.`
          : `Stripe is not configured yet, so Plans offers a local checkout preview at $${LIST_PRICES.proMonthlyUsd.toFixed(2)} monthly or $${LIST_PRICES.proAnnualUsd.toFixed(2)} annual.`}{" "}
        Letting Pro lapse keeps your trips, wishlist, and future-trip research intact; only Pro
        generation features pause.
      </p>

      <DemoCheckout
        open={demoOpen}
        interval={demoInterval}
        onIntervalChange={setDemoInterval}
        onClose={() => setDemoOpen(false)}
      />
    </div>
  );
}
