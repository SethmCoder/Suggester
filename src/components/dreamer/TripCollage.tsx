"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { SegmentedCityHero, splitDestinationCities } from "./SegmentedCityHero";
import type { FutureTrip } from "@/lib/future-trips/types";
import { titleCasePlace } from "@/lib/dreamer/bookings-store";

export type CollageTripMeta = {
  trip: FutureTrip;
  bookingCount: number;
  wishlistCount: number;
};

function statusLabel(trip: FutureTrip, bookingCount: number): string {
  if (trip.status === "planning" || trip.convertedTripId) return "Planning";
  if (bookingCount === 0) return "Open";
  return "Booked";
}

function Cell({
  meta,
  className = "",
}: {
  meta: CollageTripMeta;
  className?: string;
}) {
  const { trip, bookingCount, wishlistCount } = meta;
  const place = trip.destination?.trim() || trip.title || "Trip";
  const name = titleCasePlace(trip.title || trip.destination);
  const cities = splitDestinationCities(place);
  const badge = statusLabel(trip, bookingCount);
  const metaLine = [
    cities.length > 1 ? `${cities.length} stops` : null,
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
    <Link
      href={`/future-plans/${trip.id}`}
      className={`group relative block min-h-[140px] overflow-hidden bg-[#11165A] ${className}`}
    >
      <SegmentedCityHero
        destination={place}
        heightClass="absolute inset-0 h-full"
        className="rounded-none"
        showLabel={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/72 via-[#080B3A]/18 to-transparent transition duration-300 group-hover:from-[#080B3A]/88 group-hover:via-[#080B3A]/32" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/80">
          {badge}
        </p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-2xl">
          {name}
        </p>
        {metaLine ? (
          <p className="mt-1 text-xs text-white/80">{metaLine}</p>
        ) : (
          <p className="mt-1 text-xs text-white/70">Add a confirmation to start</p>
        )}
      </div>
    </Link>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E1E5F0] bg-[#E1E5F0] shadow-[0_8px_30px_rgba(8,11,58,0.06)]">
      {children}
    </div>
  );
}

/**
 * Adaptive collage: 1 full, 2 split, 3 as 2+1, 4+ as 2×2 rows.
 */
export function TripCollage({
  items,
}: {
  items: CollageTripMeta[];
}) {
  if (!items.length) return null;

  const shown = items.slice(0, 4);
  const rest = items.slice(4);

  if (shown.length === 1) {
    return (
      <Frame>
        <Cell meta={shown[0]} className="min-h-[240px] sm:min-h-[300px]" />
      </Frame>
    );
  }

  if (shown.length === 2) {
    return (
      <Frame>
        <div className="grid gap-px sm:grid-cols-2">
          {shown.map((meta) => (
            <Cell
              key={meta.trip.id}
              meta={meta}
              className="min-h-[200px] sm:min-h-[260px]"
            />
          ))}
        </div>
      </Frame>
    );
  }

  if (shown.length === 3) {
    return (
      <Frame>
        <div className="grid gap-px sm:grid-cols-2">
          {shown.slice(0, 2).map((meta) => (
            <Cell
              key={meta.trip.id}
              meta={meta}
              className="min-h-[180px] sm:min-h-[220px]"
            />
          ))}
          <div className="sm:col-span-2">
            <Cell meta={shown[2]} className="min-h-[170px] sm:min-h-[200px]" />
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <div className="space-y-4">
      <Frame>
        <div className="grid gap-px sm:grid-cols-2">
          {shown.map((meta) => (
            <Cell
              key={meta.trip.id}
              meta={meta}
              className="min-h-[160px] sm:min-h-[210px]"
            />
          ))}
        </div>
      </Frame>
      {rest.length ? (
        <Frame>
          <div className="grid gap-px sm:grid-cols-2">
            {rest.map((meta) => (
              <Cell
                key={meta.trip.id}
                meta={meta}
                className="min-h-[140px] sm:min-h-[160px]"
              />
            ))}
          </div>
        </Frame>
      ) : null}
    </div>
  );
}
