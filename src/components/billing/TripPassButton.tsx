"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LIST_PRICES } from "@/lib/billing/limits";

/** Starts Stripe Trip Pass checkout for one trip. Never fakes success. */
export function TripPassButton({ tripId }: { tripId: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/trip-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setNote(
          data.error ??
            "Trip Pass checkout isn't available right now.",
        );
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void buy()}>
        {busy
          ? "Opening checkout…"
          : `Trip Pass · $${LIST_PRICES.tripPassUsd.toFixed(2)}`}
      </Button>
      {note ? <p className="text-sm text-[#B45309]">{note}</p> : null}
    </div>
  );
}
