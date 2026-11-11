"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CreateAccountLink } from "@/components/auth/CreateAccountLink";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { IconArrowRight, IconPlane, IconSearch } from "@/components/ui/Icons";
import { LeavePageLink } from "@/components/ui/LeavePageLink";
import { PlanSummary } from "@/components/billing/PlanSummary";
import {
  countryFromDestination,
  destinationImageUrl,
} from "@/lib/destination-image";
import { formatTripDate } from "@/lib/format-date";
import {
  DEMO_CONTENT_VERSION,
  getDemoTripPayload,
  listDemoTrips,
} from "@/lib/demo/data";
import {
  hiddenTripIds,
  listOfflineTrips,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import { deleteTrip } from "@/lib/trips/delete-trip";
import type { TripListItem } from "@/lib/types/trip";

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
    (b.created_at || "").localeCompare(a.created_at || ""),
  );
}

function seedDemoOffline() {
  const hidden = new Set(hiddenTripIds());
  for (const trip of listDemoTrips()) {
    if (hidden.has(trip.id)) continue;
    const payload = getDemoTripPayload(trip.id);
    saveOfflineTrip({
      trip: { ...payload.trip, day_count: payload.days.length },
      days: payload.days,
      activities: payload.activities,
      updatedAt: new Date().toISOString(),
      contentVersion: DEMO_CONTENT_VERSION,
    });
  }
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl">
          <p className="text-sm text-[#6B7280]">Loading trips…</p>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q != null) setSearch(q);
  }, [searchParams]);

  function visibleTrips(list: TripListItem[]) {
    const hidden = new Set(hiddenTripIds());
    return list.filter((trip) => !hidden.has(trip.id));
  }

  async function removeTrip(trip: TripListItem) {
    const name = trip.destination.split(",")[0];
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    setDeleteError(null);
    const result = await deleteTrip(trip.id);
    if (!result.ok) {
      setDeleteError(result.error ?? "Could not delete this trip");
      return;
    }
    setTrips((current) => current.filter((item) => item.id !== trip.id));
  }

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
        setIsDemo(Boolean(d.isDemo));
        if (d.isDemo) {
          try {
            seedDemoOffline();
          } catch {
            /* ignore */
          }
          // Demo account only — hide personal offline / cloud trips.
          const demoOffline = listOfflineTrips().filter(
            (t) => t.id.startsWith("demo-") || t.id.startsWith("offline-"),
          );
          setTrips(
            visibleTrips(
              mergeTrips(
                remote.length ? remote : listDemoTrips(),
                demoOffline,
              ),
            ),
          );
        } else {
          setTrips(visibleTrips(mergeTrips(remote, offline)));
        }
      })
      .catch(() => {
        // Fully offline — show local trips (and demos if any were seeded)
        try {
          const local = listOfflineTrips();
          if (local.length) setTrips(visibleTrips(local));
          else {
            seedDemoOffline();
            setTrips(visibleTrips(listDemoTrips()));
            setIsDemo(true);
          }
        } catch {
          setTrips([]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => t.destination.toLowerCase().includes(q));
  }, [trips, search]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {isDemo ? <DemoBanner /> : null}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#080B3A]">
            Your trips
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Plan a trip, then open it anytime.
          </p>
          <div className="mt-3">
            <PlanSummary />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <LeavePageLink href="/trips/new" variant="primary">
            <span className="inline-flex items-center gap-2">
              <IconPlane size={16} />
              Plan a trip
            </span>
          </LeavePageLink>
          {isDemo ? (
            <CreateAccountLink className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-[#E1E5F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#1F2937] transition-colors hover:bg-[#EEF0F8]">
              Sign up to save trips
            </CreateAccountLink>
          ) : null}
        </div>
      </section>

      <div className="relative w-full sm:max-w-sm">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9299B5]"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search destinations…"
          className="h-11 w-full rounded-[12px] border border-[#E1E5F0] bg-white pl-9 pr-3 text-sm focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/25"
        />
      </div>

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading trips…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-[#E1E5F0] bg-white px-8 py-16 text-center">
          <p className="text-lg font-semibold text-[#1F2937]">No trips yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
            Start with a city and dates — Waypoint builds the days.
          </p>
          <LeavePageLink href="/trips/new" variant="primary" className="mt-6">
            Plan a trip
          </LeavePageLink>
        </div>
      ) : (
        <div id="trips" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {deleteError ? (
            <p className="sm:col-span-2 xl:col-span-3 text-sm text-[#B91C1C]">
              {deleteError}
            </p>
          ) : null}
          {isDemo ? <CreateTripPreviewCard /> : null}
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} onDelete={() => removeTrip(trip)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTripPreviewCard() {
  return (
    <Link
      href="/trips/new"
      className="group flex flex-col overflow-hidden rounded-[14px] border border-dashed border-[#0400FF]/35 bg-white transition hover:border-[#0400FF]"
    >
      <div className="relative flex h-36 items-center justify-center bg-[#F5F7FF]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0400FF] text-white">
          <IconPlane size={22} />
        </div>
      </div>
      <div className="flex flex-1 flex-col space-y-1 p-4">
        <h3 className="text-[16px] font-semibold text-[#1F2937]">Plan a trip</h3>
        <span className="inline-flex items-center gap-1 pt-1 text-sm font-semibold text-[#0400FF]">
          Open planner <IconArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}

function TripCard({
  trip,
  onDelete,
}: {
  trip: TripListItem;
  onDelete: () => void;
}) {
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
    <article className="group overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white transition hover:border-[#0400FF]/40">
      <Link href={`/trips/${trip.id}`} className="block">
      <div className="relative h-40 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/50 to-transparent" />
        {trip.id.startsWith("demo-") ? (
          <span className="absolute right-3 top-3 rounded-md bg-[#0400FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {trip.id === "demo-dubai" ? "Two cities" : "Sample"}
          </span>
        ) : null}
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="text-[16px] font-semibold text-[#1F2937]">
          {trip.destination.split(",")[0]}
        </h3>
        <p className="text-sm text-[#6B7280]">
          {trip.id === "demo-dubai"
            ? "Dubai and Abu Dhabi"
            : countryFromDestination(trip.destination)}
        </p>
        <p className="text-sm text-[#6B7280]">
          {formatTripDate(trip.start_date, "short")} –{" "}
          {formatTripDate(trip.end_date, "long")} · {days} days
        </p>
        <span className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-[#0400FF] group-hover:gap-2">
          View itinerary <IconArrowRight size={14} />
        </span>
      </div>
      </Link>
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={onDelete}
          className="text-sm font-semibold text-[#B91C1C] hover:underline"
        >
          Delete trip
        </button>
      </div>
    </article>
  );
}
