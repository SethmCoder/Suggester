"use client";

import { useEffect, useState } from "react";
import { TripPassButton } from "@/components/billing/TripPassButton";
import { LIST_PRICES } from "@/lib/billing/limits";

export function TripPassBanner({ tripId }: { tripId: string }) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const tripPass = params.get("trip_pass");
    if (tripPass === "cancel") {
      setNote("Trip Pass checkout was cancelled.");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    if (!sessionId || tripPass !== "success") return;
    let cancelled = false;
    fetch("/api/billing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          product?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setNote(data.error ?? "Trip Pass could not be confirmed.");
          return;
        }
        setNote(
          data.product === "trip_pass"
            ? "Trip Pass is active for this trip."
            : "Checkout confirmed.",
        );
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch(() => {
        if (!cancelled) setNote("Trip Pass confirmation failed.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E1E5F0] bg-white px-4 py-3 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
      <div>
        <p className="text-sm font-semibold text-[#080B3A]">Need premium for this trip?</p>
        <p className="text-xs text-[#6B7280]">
          Trip Pass is ${LIST_PRICES.tripPassUsd.toFixed(2)} one-time — or upgrade to
          Plus for unlimited trips.
        </p>
        {note ? <p className="mt-1 text-xs font-medium text-[#15803D]">{note}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TripPassButton tripId={tripId} />
        <a
          href="/pricing"
          className="text-sm font-semibold text-[#0400FF] underline-offset-2 hover:underline"
        >
          View Plus
        </a>
      </div>
    </div>
  );
}
