"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconPlane } from "@/components/ui/Icons";
import {
  countryFromDestination,
  destinationImageUrl,
} from "@/lib/destination-image";
import { formatTripDate } from "@/lib/format-date";
import { listOfflineTrips } from "@/lib/offline/trips";
import type { TripListItem } from "@/lib/types/trip";

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function isPastTrip(trip: TripListItem, today = todayKey()): boolean {
  const end = (trip.end_date || "").slice(0, 10);
  return Boolean(end) && end < today;
}

function mergeTrips(
  remote: TripListItem[],
  offline: TripListItem[],
): TripListItem[] {
  const byId = new Map<string, TripListItem>();
  for (const t of offline) byId.set(t.id, t);
  for (const t of remote) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  return [...byId.values()].sort((a, b) =>
    (b.end_date || "").localeCompare(a.end_date || ""),
  );
}

export function ArchiveBoard() {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const offline = (() => {
      try {
        return listOfflineTrips();
      } catch {
        return [];
      }
    })();

    fetch("/api/trips")
      .then((r) => r.json())
      .then((d) => {
        const remote = (d.trips ?? []) as TripListItem[];
        setTrips(mergeTrips(remote, offline));
      })
      .catch(() => {
        setTrips(offline);
      })
      .finally(() => setLoading(false));
  }, []);

  const past = useMemo(
    () => trips.filter((trip) => isPastTrip(trip)),
    [trips],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#080B3A]">
          Past Trips
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#6B7280]">
          Trips whose end date is before today. Open any itinerary to revisit the
          plan.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading past trips…</p>
      ) : past.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[#E1E5F0] bg-white px-8 py-16 text-center shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DDE1FF] text-[#0400FF]">
            <IconPlane size={22} />
          </div>
          <p className="text-lg font-semibold text-[#1F2937]">No past trips yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
            When a dated trip ends, it will show up here.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex text-sm font-semibold text-[#0400FF] underline-offset-2 hover:underline"
          >
            Back to Home
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {past.map((trip) => (
            <PastTripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}

function PastTripCard({ trip }: { trip: TripListItem }) {
  const days =
    trip.day_count ??
    Math.max(
      1,
      Math.ceil(
        (new Date(trip.end_date).getTime() -
          new Date(trip.start_date).getTime()) /
          86_400_000,
      ) + 1,
    );
  const img = trip.cover_image_url || destinationImageUrl(trip.destination);

  return (
    <article className="overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_4px_20px_rgba(8,11,58,0.05)] transition hover:-translate-y-0.5 hover:border-[#0400FF]/25 hover:shadow-[0_12px_32px_rgba(8,11,58,0.1)]">
      <Link href={`/trips/${trip.id}`} className="block">
        <div className="relative h-40 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/50 to-transparent" />
          <span className="absolute left-3 top-3 rounded-md bg-[#080B3A]/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Past
          </span>
        </div>
        <div className="space-y-1.5 p-4">
          <h3 className="text-[16px] font-semibold text-[#1F2937]">
            {trip.destination.split(",")[0]}
          </h3>
          <p className="text-sm text-[#6B7280]">
            {countryFromDestination(trip.destination)}
          </p>
          <p className="text-sm text-[#6B7280]">
            {formatTripDate(trip.start_date, "short")} –{" "}
            {formatTripDate(trip.end_date, "long")} · {days} days
          </p>
          <span className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-[#0400FF]">
            Open <IconArrowRight size={14} />
          </span>
        </div>
      </Link>
    </article>
  );
}
