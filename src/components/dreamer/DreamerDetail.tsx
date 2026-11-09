"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { buildDreamerSuggestions } from "@/lib/dreamer/suggestions";
import {
  listDreamerBookings,
  setDreamerBookings,
  titleCasePlace,
} from "@/lib/dreamer/bookings-store";
import type { DreamerBooking, DreamerSuggestion } from "@/lib/dreamer/types";
import { getFutureTrip, updateFutureTrip } from "@/lib/future-trips/store";
import type { FutureTrip } from "@/lib/future-trips/types";
import {
  destinationImageUrl,
  hasCuratedCityImage,
} from "@/lib/destination-image";

export function DreamerDetail({ id }: { id: string }) {
  const [trip, setTrip] = useState<FutureTrip | null>(null);
  const [bookings, setBookings] = useState<DreamerBooking[]>([]);
  const [suggestions, setSuggestions] = useState<DreamerSuggestion[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    const local = listDreamerBookings(id);
    setBookings(local);
    try {
      const res = await fetch(`/api/dreamer/${id}/bookings`);
      const data = (await res.json()) as { bookings?: DreamerBooking[] };
      if (Array.isArray(data.bookings)) {
        setDreamerBookings(id, data.bookings);
        setBookings(data.bookings);
        return data.bookings;
      }
    } catch {
      /* keep local */
    }
    return local;
  }, [id]);

  useEffect(() => {
    const local = getFutureTrip(id);
    setTrip(local ?? null);
    void loadBookings().then((list) => {
      if (list.length && local) {
        const flight = list.find((b) => b.kind === "flight");
        const start = flight?.parsed?.startDate ?? null;
        setSuggestions(
          buildDreamerSuggestions({
            destination: local.destination,
            stayDays: local.estimatedDurationDays ?? null,
            month: start ? Number(String(start).slice(5, 7)) : null,
          }),
        );
      } else {
        setSuggestions([]);
      }
    });
    void fetch("/api/dreamer/mailbox")
      .then((r) => r.json())
      .then((d: { address?: string }) => {
        if (d.address) setMailbox(d.address);
      })
      .catch(() => null);
  }, [id, loadBookings]);

  async function materialize() {
    if (!bookings.length) {
      setMessage("Forward a confirmation email first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/dreamer/${id}/materialize`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build trip");
      if (data.tripId) {
        updateFutureTrip(id, {
          convertedTripId: data.tripId,
          status: "planning",
        });
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

  const name = titleCasePlace(trip.title || trip.destination);
  const waiting = bookings.length === 0;
  const photo = hasCuratedCityImage(name);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link href="/dreamer" className="text-sm font-semibold text-[#0400FF]">
        ← Dreams
      </Link>

      <header className="overflow-hidden rounded-[20px] border border-[#E1E5F0] bg-white">
        {photo ? (
          <div className="relative h-40 sm:h-52">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={destinationImageUrl(name)}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/75 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5">
              <p className="text-3xl font-bold text-white">{name}</p>
              <p className="mt-1 text-sm text-white/80">
                {waiting
                  ? "Dreaming — waiting for your first confirmation"
                  : `${bookings.length} booking${bookings.length === 1 ? "" : "s"} in`}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-[#080B3A] px-5 py-8 text-white">
            <p className="text-3xl font-bold">{name}</p>
            <p className="mt-1 text-sm text-white/80">
              {waiting
                ? "Dreaming — waiting for your first confirmation"
                : `${bookings.length} booking${bookings.length === 1 ? "" : "s"} in`}
            </p>
          </div>
        )}
      </header>

      {mailbox ? (
        <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
          <p className="text-xs font-semibold uppercase text-[#6B7280]">
            Forward confirmations to
          </p>
          <code className="mt-2 block text-sm text-[#080B3A]">{mailbox}</code>
          <p className="mt-2 text-xs text-[#6B7280]">
            Forward a flight or hotel email from your account address. Dates and
            itinerary stay empty until something arrives.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => void loadBookings()}
          >
            Check for new forwards
          </Button>
        </section>
      ) : null}

      <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#080B3A]">Bookings</h2>
          <span className="text-xs text-[#9CA3AF]">
            {waiting ? "None yet" : `${bookings.length} item${bookings.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {waiting ? (
          <div className="mt-4 rounded-[12px] border border-dashed border-[#D1D7E5] bg-[#FAFBFF] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-[#080B3A]">
              Empty itinerary
            </p>
            <p className="mt-1 text-sm text-[#6B7280]">
              No dates, flights, or hotels until you forward a confirmation.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {bookings.map((b) => (
              <li
                key={b.id}
                className="flex items-start justify-between gap-3 rounded-[10px] border border-[#F0F2F8] px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-[#080B3A]">{b.title}</p>
                  <p className="text-xs text-[#6B7280]">
                    {b.kind}
                    {b.parsed.startDate ? ` · ${b.parsed.startDate}` : ""}
                    {b.parsed.cabin ? ` · ${b.parsed.cabin}` : ""}
                    {b.parsed.confirmation
                      ? ` · conf ${b.parsed.confirmation}`
                      : ""}
                  </p>
                </div>
                <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#047857]">
                  From email
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#080B3A]">Itinerary</h2>
        {waiting ? (
          <p className="mt-3 text-sm text-[#6B7280]">
            Nothing scheduled yet. After the first booking lands, suggestions
            and a buildable trip appear here.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-[#4B5563]">
              Bookings are ready. Build a trip from them when you want a full
              day-by-day plan.
            </p>
            {suggestions.map((s) => (
              <article
                key={s.id}
                className="rounded-[10px] border border-[#F0F2F8] px-3 py-2"
              >
                <p className="text-sm font-semibold text-[#080B3A]">{s.title}</p>
                <p className="mt-1 text-sm text-[#4B5563]">{s.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy || waiting}
          onClick={() => void materialize()}
        >
          {busy
            ? "Building…"
            : waiting
              ? "Waiting for first booking"
              : "Build itinerary from bookings"}
        </Button>
        {trip.convertedTripId ? (
          <Link
            href={`/trips/${trip.convertedTripId}`}
            className="rounded-[10px] bg-[#F5F7FF] px-4 py-2 text-sm font-semibold text-[#0400FF]"
          >
            Open trip
          </Link>
        ) : null}
      </div>
      {message ? <p className="text-sm text-[#B91C1C]">{message}</p> : null}
    </div>
  );
}
