"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { countCreatedOfflineTrips } from "@/lib/offline/trips";
import type { BillingSnapshot } from "@/lib/billing/plans";
import { LIST_PRICES, planCopy, tripPassCopy } from "@/lib/billing/limits";

type BillingView = BillingSnapshot & {
  entitled?: boolean;
  checkoutAvailable?: boolean;
  signedIn?: boolean;
  selfGrantAvailable?: boolean;
  secretGrantAvailable?: boolean;
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

export function BillingPlansPanel({
  showTripPass = true,
  heading = "Billing",
}: {
  showTripPass?: boolean;
  heading?: string;
}) {
  const [billing, setBilling] = useState<BillingView | null>(null);
  const [busy, setBusy] = useState<"month" | "year" | "portal" | "grant" | null>(
    null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [grantSecret, setGrantSecret] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const free = planCopy(false);
  const plus = planCopy(true);
  const tripPass = tripPassCopy();

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const cancelledCheckout = params.get("checkout");
    async function load() {
      if (sessionId) {
        const confirmed = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = (await confirmed.json().catch(() => ({}))) as {
          error?: string;
          product?: string;
        };
        if (!confirmed.ok) {
          if (!cancelled) setNote(data.error ?? "Checkout could not be confirmed.");
        } else if (!cancelled) {
          setNote(
            data.product === "trip_pass"
              ? "Trip Pass is active for that trip."
              : "Plus is active on this account. Saved trips and research stay available.",
          );
          window.history.replaceState(null, "", window.location.pathname);
        }
      } else if (cancelledCheckout === "cancel" && !cancelled) {
        setNote("Checkout was cancelled. Nothing was charged.");
      }
      const data = await syncPlan("sync");
      if (!cancelled) setBilling(data);
    }
    load().catch(() => {
      if (!cancelled) {
        setBilling({ plan: "free", used: 0, limit: 2, remaining: 2 });
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
        setNote(data.error ?? "Checkout couldn't start. Try again later.");
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
        setNote(data.error ?? "Could not unlock Plus on this account.");
        return;
      }
      setNote("Plus is active on this signed-in account.");
      setGrantSecret("");
      setBilling(await syncPlan("sync"));
    } finally {
      setBusy(null);
    }
  }

  async function grantAccountByEmail() {
    const email = grantEmail.trim();
    const secret = grantSecret.trim();
    if (!email || !secret) {
      setNote("Enter the account email and grant secret.");
      return;
    }
    setBusy("grant");
    setNote(null);
    try {
      const res = await fetch("/api/billing/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-waypoint-grant-secret": secret,
        },
        body: JSON.stringify({ email, tier: "pro", secret }),
      });
      const data = (await res.json()) as { error?: string; userId?: string };
      if (!res.ok) {
        setNote(data.error ?? "Could not grant Plus to that account.");
        return;
      }
      setNote(`Plus granted to ${email}. They should refresh Settings.`);
      setGrantEmail("");
      setGrantSecret("");
      setBilling(await syncPlan("sync"));
    } finally {
      setBusy(null);
    }
  }

  const entitled = Boolean(billing?.entitled);
  const checkout = Boolean(billing?.checkoutAvailable);
  const atTripLimit =
    !entitled &&
    billing != null &&
    billing.limit != null &&
    billing.used >= billing.limit;
  const canTrySelfGrant =
    Boolean(billing?.signedIn) &&
    !entitled &&
    (Boolean(billing?.selfGrantAvailable) ||
      Boolean(billing?.allowlisted) ||
      Boolean(billing?.secretGrantAvailable));
  const canGrantByEmail =
    !entitled && Boolean(billing?.secretGrantAvailable);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#080B3A]">
          {heading}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#6B7280]">
          Free covers research basics. Plus unlocks unlimited trips and the full
          Trip Wizard. Trip Pass unlocks premium tools for a single trip.
        </p>
        {entitled ? (
          <p className="mt-3 inline-flex items-center rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-semibold text-[#15803D]">
            Plus active on this account
          </p>
        ) : null}
        {atTripLimit ? (
          <p className="mt-3 rounded-[12px] border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2 text-sm text-[#92400E]">
            You’ve used your {billing?.limit ?? 2} free active trips. Upgrade to
            Plus or buy a Trip Pass for another trip.
          </p>
        ) : null}
      </div>

      {!checkout ? (
        <div className="rounded-[16px] border border-[#FCD34D] bg-[#FFFBEB] px-5 py-4 text-sm text-[#92400E]">
          <p className="font-semibold text-[#78350F]">Checkout unavailable</p>
          <p className="mt-1 leading-relaxed">
            Online payments aren&apos;t enabled on this server yet. You can still
            use Free planning; paid upgrades will open when billing is turned on.
          </p>
        </div>
      ) : null}

      <div
        className={`grid gap-4 ${showTripPass ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">
            {free.title}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-[#080B3A]">
            $0
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#1F2937]">
            {free.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9299B5]" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-[#6B7280]">
            {billing
              ? `${billing.used} of ${billing.limit ?? 2} trips used`
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
                  : "Plus is on"
              : "Current plan"}
          </Button>
        </section>

        <section className="rounded-[16px] border border-[#0400FF]/25 bg-gradient-to-b from-[#F5F7FF] to-white p-6 shadow-[0_4px_20px_rgba(4,0,255,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0400FF]">
            {plus.title}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-[#080B3A]">
            {`$${LIST_PRICES.proMonthlyUsd.toFixed(2)}`}
            <span className="ml-1 text-sm font-medium text-[#6B7280]">/ month</span>
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            {`or $${LIST_PRICES.proAnnualUsd.toFixed(2)} / year`}
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#1F2937]">
            {plus.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0400FF]" />
                <span>{bullet}</span>
              </li>
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
              <Button type="button" disabled>
                Checkout unavailable
              </Button>
            )}
          </div>
        </section>

        {showTripPass ? (
          <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">
              {tripPass.title}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#080B3A]">
              {`$${tripPass.priceUsd.toFixed(2)}`}
              <span className="ml-1 text-sm font-medium text-[#6B7280]">
                one-time
              </span>
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#1F2937]">
              {tripPass.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9299B5]" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-[#6B7280]">
              Purchase from a trip page after you create the trip.
            </p>
            <Link
              href="/trips/new"
              className="mt-4 inline-flex text-sm font-semibold text-[#0400FF] underline-offset-2 hover:underline"
            >
              Create a trip first
            </Link>
          </section>
        ) : null}
      </div>

      {canTrySelfGrant || canGrantByEmail ? (
        <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <h3 className="text-sm font-semibold text-[#080B3A]">
            Upgrade a single account
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[#6B7280]">
            Manual Plus unlock for this environment (operator tools).
          </p>
          {canTrySelfGrant ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="password"
                value={grantSecret}
                onChange={(e) => setGrantSecret(e.target.value)}
                placeholder="Support code (if required)"
                className="h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3.5 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35 sm:max-w-xs"
              />
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => void unlockThisAccount()}
              >
                {busy === "grant" ? "Unlocking…" : "Unlock Plus for me"}
              </Button>
            </div>
          ) : null}
          {canGrantByEmail ? (
            <div className="mt-4 space-y-2 border-t border-[#F0F2F8] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6B7280]">
                Grant by email
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder="traveler@email.com"
                  className="h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3.5 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
                />
                <input
                  type="password"
                  value={grantSecret}
                  onChange={(e) => setGrantSecret(e.target.value)}
                  placeholder="Support code"
                  className="h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3.5 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35 sm:max-w-[11rem]"
                />
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void grantAccountByEmail()}
                >
                  {busy === "grant" ? "Granting…" : "Grant Plus"}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {note ? (
        <p className="max-w-xl rounded-[12px] border border-[#E1E5F0] bg-white px-4 py-3 text-sm text-[#080B3A]">
          {note}
        </p>
      ) : null}
      <p className="max-w-xl text-xs leading-relaxed text-[#6B7280]">
        {checkout
          ? `Checkout prices: $${LIST_PRICES.proMonthlyUsd.toFixed(2)}/mo, $${LIST_PRICES.proAnnualUsd.toFixed(2)}/yr, or $${LIST_PRICES.tripPassUsd.toFixed(2)} Trip Pass.`
          : `Listed prices: $${LIST_PRICES.proMonthlyUsd.toFixed(2)}/mo, $${LIST_PRICES.proAnnualUsd.toFixed(2)}/yr, $${LIST_PRICES.tripPassUsd.toFixed(2)} Trip Pass. Checkout opens when billing is enabled.`}{" "}
        Letting Plus lapse keeps your trips and Collections intact; only premium
        generation features pause. See{" "}
        <Link href="/pricing" className="font-semibold text-[#0400FF] underline-offset-2 hover:underline">
          full pricing
        </Link>
        .
      </p>
    </div>
  );
}
