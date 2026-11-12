"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasteDropZone } from "@/components/dreamer/PasteDropZone";
import { TripCollage, type CollageTripMeta } from "@/components/dreamer/TripCollage";
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
import { listItems } from "@/lib/wishlist/store";

export function DreamerBoard() {
  const [trips, setTrips] = useState<FutureTrip[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [wishCounts, setWishCounts] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState("");
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  function refresh() {
    const list = listFutureTrips();
    setTrips(list);
    const next: Record<string, number> = {};
    const wishes: Record<string, number> = {};
    const items = listItems();
    for (const trip of list) {
      next[trip.id] = dreamBookingCount(trip.id);
      const attached = trip.wishlistItemIds?.length ?? 0;
      const tripDest = trip.destination.toLowerCase();
      const matched = items.filter((item) => {
        const dest = (item.location || item.address || item.name || "").toLowerCase();
        return (
          Boolean(dest) &&
          (tripDest.includes(dest.split(",")[0]?.trim() || "___") ||
            dest.includes(tripDest.split(/[,→]/)[0]?.trim() || "___") ||
            trip.wishlistItemIds.includes(item.id))
        );
      }).length;
      wishes[trip.id] = Math.max(attached, matched);
    }
    setCounts(next);
    setWishCounts(wishes);
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

  const collageItems: CollageTripMeta[] = useMemo(
    () =>
      trips.map((trip) => ({
        trip,
        bookingCount: counts[trip.id] ?? 0,
        wishlistCount: wishCounts[trip.id] ?? 0,
      })),
    [trips, counts, wishCounts],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0400FF]">
          Planning
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-tight text-[#080B3A] sm:text-[2.25rem]">
          Future Trips
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7280]">
          Hold destinations before tickets exist. Forward or paste a confirmation
          and Waypoint opens a calendar from the evidence.
        </p>
      </header>

      <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="future-dest"
              className="text-sm font-medium text-[#080B3A]"
            >
              New destination
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="future-dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createDream();
                  }
                }}
                placeholder="Tokyo, Munich, London…"
                className="sm:max-w-md"
              />
              <Button
                type="button"
                disabled={creating || destination.trim().length < 2}
                onClick={() => void createDream()}
              >
                {creating ? "Saving…" : "Add trip"}
              </Button>
            </div>
          </div>
          {mailbox ? (
            <div className="min-w-0 shrink-0 border-t border-[#F0F2F8] pt-4 lg:max-w-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="text-xs font-medium text-[#6B7280]">
                Forward confirmations
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="truncate rounded-[8px] bg-[#F5F7FF] px-2.5 py-1.5 text-xs text-[#080B3A]">
                  {mailbox}
                </code>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-[#0400FF] hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(mailbox).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {trips.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[#D1D7E5] bg-[#FAFBFF] px-6 py-16 text-center">
          <p className="text-base font-semibold text-[#080B3A]">
            No trips yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#6B7280]">
            Add a city above. Your destinations will appear here as a visual
            collage.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#080B3A]">
              Your destinations
            </h2>
            <p className="text-xs text-[#9CA3AF]">
              {trips.length} trip{trips.length === 1 ? "" : "s"}
            </p>
          </div>
          <TripCollage items={collageItems} />
        </div>
      )}

      {trips.length > 0 ? (
        <section className="rounded-[18px] border border-[#E1E5F0] bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between px-5 py-4 text-left"
            onClick={() => setManageOpen((v) => !v)}
          >
            <div>
              <p className="text-sm font-semibold text-[#080B3A]">
                Paste confirmations
              </p>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                Drop text or a screenshot onto a trip without opening it
              </p>
            </div>
            <span className="text-xs font-semibold text-[#0400FF]">
              {manageOpen ? "Hide" : "Show"}
            </span>
          </button>
          {manageOpen ? (
            <ul className="divide-y divide-[#F0F2F8] border-t border-[#F0F2F8]">
              {trips.map((trip) => {
                const name = titleCasePlace(trip.title || trip.destination);
                return (
                  <li key={trip.id} className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <Link
                        href={`/future-plans/${trip.id}`}
                        className="text-sm font-semibold text-[#080B3A] hover:text-[#0400FF]"
                      >
                        {name}
                      </Link>
                      <button
                        type="button"
                        className="text-xs font-medium text-[#9CA3AF] hover:text-[#B91C1C]"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete ${name}? Bookings on this device will be removed too.`,
                            )
                          ) {
                            return;
                          }
                          void removeFutureTrip(trip.id).then(() => refresh());
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    <PasteDropZone
                      preferredFutureTripId={trip.id}
                      compact
                      onDone={(result) => {
                        const booking = result.booking as
                          | DreamerBooking
                          | undefined;
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
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
