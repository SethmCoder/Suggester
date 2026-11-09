"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { buildDreamerSuggestions } from "@/lib/dreamer/suggestions";
import type { DreamerSuggestion } from "@/lib/dreamer/types";
import {
  getFutureTrip,
  updateFutureTrip,
} from "@/lib/future-trips/store";
import type { FutureTrip } from "@/lib/future-trips/types";

export function DreamerDetail({ id }: { id: string }) {
  const [trip, setTrip] = useState<FutureTrip | null>(null);
  const [stayDays, setStayDays] = useState(3);
  const [suggestions, setSuggestions] = useState<DreamerSuggestion[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [mailboxHint, setMailboxHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const local = getFutureTrip(id);
    setTrip(local ?? null);
    if (local?.estimatedDurationDays) {
      setStayDays(local.estimatedDurationDays);
    }
    if (local) {
      setSuggestions(
        buildDreamerSuggestions({
          destination: local.destination,
          stayDays: local.estimatedDurationDays ?? 3,
          month: local.potentialStart
            ? Number(local.potentialStart.slice(5, 7))
            : null,
        }),
      );
    }
    void fetch("/api/dreamer/mailbox")
      .then((r) => r.json())
      .then((d: { address?: string; hint?: string }) => {
        if (d.address) setMailbox(d.address);
        if (d.hint) setMailboxHint(d.hint);
      })
      .catch(() => null);
  }, [id]);

  function saveStay() {
    if (!trip) return;
    updateFutureTrip(trip.id, { estimatedDurationDays: stayDays });
    const next = getFutureTrip(id);
    setTrip(next ?? null);
    if (next) {
      setSuggestions(
        buildDreamerSuggestions({
          destination: next.destination,
          stayDays,
          month: next.potentialStart
            ? Number(next.potentialStart.slice(5, 7))
            : 7,
        }),
      );
    }
  }

  async function materialize() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/dreamer/${id}/materialize`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build trip");
      if (data.tripId) {
        updateFutureTrip(id, { convertedTripId: data.tripId, status: "planning" });
        window.location.href = `/trips/${data.tripId}`;
        return;
      }
      setMessage("Trip ready.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-[#6B7280]">Dream not found on this device.</p>
        <Link href="/dreamer" className="text-sm font-semibold text-[#0400FF]">
          Back to Dreamer
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link href="/dreamer" className="text-sm font-semibold text-[#0400FF]">
        ← Dreams
      </Link>
      <header>
        <h1 className="text-3xl font-bold text-[#080B3A]">
          {trip.title || trip.destination}
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">{trip.destination}</p>
      </header>

      {mailbox ? (
        <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
          <p className="text-xs font-semibold uppercase text-[#6B7280]">
            Forward confirmations to
          </p>
          <code className="mt-2 block text-sm">{mailbox}</code>
          <p className="mt-2 text-xs text-[#6B7280]">
            {mailboxHint ??
              "Forward from the email on your Waypoint account. We match the sender — no + codes."}
          </p>
        </section>
      ) : null}

      <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
        <Label>Soft stay length (days)</Label>
        <div className="mt-2 flex gap-2">
          <Input
            type="number"
            min={1}
            max={30}
            value={stayDays}
            onChange={(e) => setStayDays(Math.max(1, Number(e.target.value) || 1))}
            className="w-24"
          />
          <Button type="button" variant="secondary" onClick={saveStay}>
            Save
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#080B3A]">Suggestions</h2>
        {suggestions.map((s) => (
          <article
            key={s.id}
            className="rounded-[12px] border border-[#E1E5F0] bg-white p-4"
          >
            <p className="text-sm font-semibold text-[#080B3A]">{s.title}</p>
            <p className="mt-1 text-sm text-[#4B5563]">{s.body}</p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-[#9CA3AF]">
              {s.confidence}
            </p>
          </article>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => void materialize()}>
          {busy ? "Building…" : "Build itinerary from bookings"}
        </Button>
        {trip.convertedTripId ? (
          <Link
            href={`/trips/${trip.convertedTripId}`}
            className="rounded-[10px] bg-[#F5F7FF] px-4 py-2 text-sm font-semibold text-[#0400FF]"
          >
            Open trip
          </Link>
        ) : null}
        <Link
          href={`/trips/new?future=${trip.id}`}
          className="rounded-[10px] px-4 py-2 text-sm font-semibold text-[#6B7280]"
        >
          Advanced plan (wizard)
        </Link>
      </div>
      {message ? <p className="text-sm text-[#B91C1C]">{message}</p> : null}
    </div>
  );
}
