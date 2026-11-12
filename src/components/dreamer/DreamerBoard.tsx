"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasteDropZone } from "@/components/dreamer/PasteDropZone";
import {
  SegmentedCityHero,
  splitDestinationCities,
} from "@/components/dreamer/SegmentedCityHero";
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
import { destinationImageUrl } from "@/lib/destination-image";

function statusLabel(trip: FutureTrip, bookingCount: number): string {
  if (trip.status === "planning" || trip.convertedTripId) return "Planning";
  if (bookingCount === 0) return "Open";
  return "Booked";
}

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

  const heroCities = useMemo(() => {
    const cities: string[] = [];
    const seen = new Set<string>();
    for (const trip of trips) {
      for (const city of splitDestinationCities(trip.destination)) {
        const key = city.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cities.push(city);
        if (cities.length >= 4) return cities;
      }
    }
    return cities;
  }, [trips]);

  const heroDestination =
    heroCities.length > 0 ? heroCities.join(" → ") : "Tokyo → Kyoto";

  return (
    <div className="space-y-0">
      <header className="relative overflow-hidden border-b border-[#E1E5F0]">
        <SegmentedCityHero
          destination={heroDestination}
          heightClass="absolute inset-0 h-full min-h-[220px] sm:min-h-[280px]"
          className="rounded-none"
          showLabel={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/88 via-[#080B3A]/45 to-[#080B3A]/25" />
        <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
            Planning
          </p>
          <h1 className="mt-2 max-w-xl text-[2.25rem] font-semibold tracking-tight text-white sm:text-[2.75rem]">
            Future Trips
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/85">
            Hold destinations before tickets exist. Forward or paste a
            confirmation and Waypoint opens a calendar from the evidence.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
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
              Add a city above. Destinations show up as a list you can open and
              paste confirmations into.
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
            <ul className="overflow-hidden rounded-[18px] border border-[#E1E5F0] bg-white shadow-[0_4px_16px_rgba(8,11,58,0.04)]">
              {trips.map((trip) => {
                const name = titleCasePlace(trip.title || trip.destination);
                const cities = splitDestinationCities(trip.destination);
                const bookingCount = counts[trip.id] ?? 0;
                const wishlistCount = wishCounts[trip.id] ?? 0;
                const badge = statusLabel(trip, bookingCount);
                const thumb = destinationImageUrl(cities[0] || trip.destination);
                const meta = [
                  cities.length > 1 ? cities.join(" · ") : null,
                  bookingCount > 0
                    ? `${bookingCount} booking${bookingCount === 1 ? "" : "s"}`
                    : null,
                  wishlistCount > 0
                    ? `${wishlistCount} wishlist`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={trip.id}
                    className="border-b border-[#F0F2F8] last:border-b-0"
                  >
                    <Link
                      href={`/future-plans/${trip.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-[#F5F7FF] sm:px-5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-[12px] object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold text-[#080B3A]">
                            {name}
                          </p>
                          <span className="rounded-[6px] bg-[#F5F7FF] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0400FF]">
                            {badge}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[#6B7280]">
                          {meta || "Add a confirmation to start"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-[#0400FF]">
                        Open
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
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
                          if (result.planShift?.shifted || booking) {
                            window.location.href = `/future-plans/${
                              booking?.futureTripId ||
                              result.match?.id ||
                              trip.id
                            }`;
                          }
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
    </div>
  );
}
