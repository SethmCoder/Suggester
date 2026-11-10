"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { PasteDropZone } from "@/components/dreamer/PasteDropZone";
import {
  dreamBookingCount,
  listDreamerBookings,
  setDreamerBookings,
  titleCasePlace,
} from "@/lib/dreamer/bookings-store";
import type { DreamerBooking } from "@/lib/dreamer/types";
import { listFutureTrips, updateFutureTrip } from "@/lib/future-trips/store";
import { removeFutureTrip, saveFutureTrip } from "@/lib/future-trips/sync";
import type { FutureTrip } from "@/lib/future-trips/types";
import {
  destinationImageUrl,
  hasCuratedCityImage,
} from "@/lib/destination-image";

export function DreamerBoard() {
  const [trips, setTrips] = useState<FutureTrip[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState("");
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    const list = listFutureTrips();
    setTrips(list);
    const next: Record<string, number> = {};
    for (const trip of list) {
      next[trip.id] = dreamBookingCount(trip.id);
    }
    setCounts(next);
  }

  useEffect(() => {
    refresh();
    void fetch("/api/dreamer/mailbox")
      .then((r) => r.json())
      .then((d: { address?: string }) => {
        if (d.address) setMailbox(d.address);
      })
      .catch(() => null);

    void fetch("/api/future-trips")
      .then((r) => r.json())
      .then(() => {
        refresh();
        const list = listFutureTrips();
        void Promise.all(
          list.map(async (trip) => {
            try {
              const res = await fetch(`/api/dreamer/${trip.id}/bookings`);
              const data = (await res.json()) as { bookings?: DreamerBooking[] };
              if (Array.isArray(data.bookings)) {
                setDreamerBookings(trip.id, data.bookings);
              }
            } catch {
              /* offline */
            }
          }),
        ).then(() => refresh());
      })
      .catch(() => refresh());
  }, []);

  async function createDream() {
    const dest = titleCasePlace(destination);
    if (dest.length < 2 || creating) return;
    setCreating(true);
    try {
      const trip = await saveFutureTrip({
        destination: dest,
        title: dest,
        status: "wishlist",
        estimatedDurationDays: null,
        potentialStart: null,
        potentialEnd: null,
        preferences: { dreamer: { awaitingBookings: true } },
      });
      setDestination("");
      refresh();
      window.location.href = `/future-plans/${trip.id}`;
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-[#080B3A]">Future Plans</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#6B7280]">
          Save where you want to go. Paste, screenshot, or forward a
          confirmation — Future Plans fills bookings from evidence, then
          suggests places once it exists.
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
            Forward from the email on your Waypoint account. Or paste text /
            drop a screenshot onto a city card below.
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
          <Button type="button" disabled={creating} onClick={() => void createDream()}>
            {creating ? "Saving…" : "Start planning"}
          </Button>
        </div>
      </section>

      {trips.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[#D1D7E5] bg-white px-5 py-10 text-center">
          <p className="text-sm font-semibold text-[#080B3A]">No future plans yet</p>
          <p className="mt-1 text-sm text-[#6B7280]">
            Add a destination above. It stays blank until the first booking
            email arrives.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {trips.map((trip) => {
            const name = titleCasePlace(trip.title || trip.destination);
            const bookingCount = counts[trip.id] ?? 0;
            const waiting = bookingCount === 0;
            const planning = trip.status === "planning" || Boolean(trip.convertedTripId);
            const photo = hasCuratedCityImage(name);
            return (
              <li
                key={trip.id}
                className="overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white"
              >
                <Link
                  href={`/future-plans/${trip.id}`}
                  className="flex hover:bg-[#FAFBFF]"
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={destinationImageUrl(name)}
                      alt=""
                      className="h-28 w-28 shrink-0 object-cover sm:h-32 sm:w-40"
                    />
                  ) : (
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center bg-[#080B3A] text-2xl font-bold text-white sm:h-32 sm:w-40">
                      {name.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-[#080B3A]">
                        {name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          planning
                            ? "bg-[#EEF2FF] text-[#3730A3]"
                            : waiting
                              ? "bg-[#F5F7FF] text-[#0400FF]"
                              : "bg-[#ECFDF5] text-[#047857]"
                        }`}
                      >
                        {planning
                          ? "Plan"
                          : waiting
                            ? "Waiting for bookings"
                            : "Bookings in"}
                      </span>
                    </div>
                    <p className="text-sm text-[#6B7280]">
                      {waiting
                        ? "Empty plan — paste or forward a confirmation to fill this in."
                        : `${bookingCount} booking${bookingCount === 1 ? "" : "s"} attached`}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {waiting
                        ? "No dates · No itinerary yet"
                        : trip.potentialStart
                          ? `${trip.potentialStart}${trip.potentialEnd ? ` – ${trip.potentialEnd}` : ""}`
                          : "Dates from your bookings"}
                    </p>
                  </div>
                </Link>
                <div className="space-y-3 border-t border-[#F0F2F8] px-4 py-3">
                  <PasteDropZone
                    preferredFutureTripId={trip.id}
                    compact
                    onDone={(result) => {
                      const booking = result.booking as DreamerBooking | undefined;
                      if (booking) {
                        const matchedId =
                          booking.futureTripId ||
                          (result.match?.kind === "dream"
                            ? result.match.id
                            : trip.id);
                        const list = [
                          ...listDreamerBookings(matchedId),
                          booking,
                        ];
                        setDreamerBookings(matchedId, list);
                        if (result.planShift?.shifted) {
                          updateFutureTrip(matchedId, {
                            status: "planning",
                            potentialStart:
                              booking.parsed.startDate ?? undefined,
                          });
                        }
                      }
                      refresh();
                    }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#B91C1C] hover:underline"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete ${name}? Attached bookings on this device will be removed too.`,
                          )
                        ) {
                          return;
                        }
                        void removeFutureTrip(trip.id).then(() => refresh());
                      }}
                    >
                      Delete plan
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
