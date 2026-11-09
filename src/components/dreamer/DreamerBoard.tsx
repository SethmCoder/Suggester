"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  createFutureTrip,
  listFutureTrips,
} from "@/lib/future-trips/store";
import type { FutureTrip } from "@/lib/future-trips/types";

export function DreamerBoard() {
  const [trips, setTrips] = useState<FutureTrip[]>([]);
  const [destination, setDestination] = useState("");
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [mailboxHint, setMailboxHint] = useState<string | null>(null);

  function refresh() {
    setTrips(listFutureTrips());
  }

  useEffect(() => {
    refresh();
    void fetch("/api/dreamer/mailbox")
      .then((r) => r.json())
      .then((d: { address?: string; hint?: string }) => {
        if (d.address) setMailbox(d.address);
        if (d.hint) setMailboxHint(d.hint);
      })
      .catch(() => {
        /* offline */
      });
    void fetch("/api/future-trips")
      .then((r) => r.json())
      .then(() => refresh())
      .catch(() => refresh());
  }, []);

  function createDream() {
    const dest = destination.trim();
    if (dest.length < 2) return;
    const trip = createFutureTrip({
      destination: dest,
      title: dest,
      status: "wishlist",
    });
    setDestination("");
    refresh();
    window.location.href = `/dreamer/${trip.id}`;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-[#080B3A]">Dreamer</h1>
        <p className="mt-2 text-sm text-[#6B7280]">
          Start with a place you want to go. Forward booking confirmations to
          your Waypoint inbox — we match them to the best dream and build from
          there, without Plan a Trip.
        </p>
      </header>

      {mailbox ? (
        <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Forward confirmations to
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-[8px] bg-[#F5F7FF] px-3 py-2 text-sm text-[#080B3A]">
              {mailbox}
            </code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(mailbox)}
            >
              Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">
            {mailboxHint ??
              "Use the same address for everyone. Waypoint reads who forwarded the email and matches your account — no + codes."}
          </p>
        </section>
      ) : null}

      <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-4">
        <Label>Where do you want to go?</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Tokyo, Paris, Cairo…"
            className="max-w-sm"
          />
          <Button type="button" onClick={createDream}>
            Start dreaming
          </Button>
        </div>
      </section>

      <ul className="space-y-3">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link
              href={`/dreamer/${trip.id}`}
              className="block rounded-[14px] border border-[#E1E5F0] bg-white px-4 py-3 hover:border-[#0400FF]/40"
            >
              <p className="font-semibold text-[#080B3A]">
                {trip.title || trip.destination}
              </p>
              <p className="text-xs text-[#6B7280]">
                {trip.destination}
                {trip.potentialStart
                  ? ` · ${trip.potentialStart}${trip.potentialEnd ? ` – ${trip.potentialEnd}` : ""}`
                  : ""}
                {trip.estimatedDurationDays
                  ? ` · ~${trip.estimatedDurationDays} days`
                  : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
