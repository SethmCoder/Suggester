"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CreateAccountLink } from "@/components/auth/CreateAccountLink";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { IconArrowRight, IconExternalLink, IconPlane, IconSearch } from "@/components/ui/Icons";
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
      legs: payload.legs,
      updatedAt: new Date().toISOString(),
      contentVersion: DEMO_CONTENT_VERSION,
    });
  }
}

export default function DashboardPage() {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          // Keep Paris as the sole canonical demo; drop legacy demo-* ids.
          const allowedDemoIds = new Set(listDemoTrips().map((t) => t.id));
          const demoOffline = listOfflineTrips().filter(
            (t) =>
              allowedDemoIds.has(t.id) || t.id.startsWith("offline-"),
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

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const upcomingTrips = useMemo(
    () =>
      trips
        .filter((t) => (t.end_date || "").slice(0, 10) >= today)
        .sort((a, b) =>
          (a.start_date || "").localeCompare(b.start_date || ""),
        ),
    [trips, today],
  );
  const nextTrip = upcomingTrips[0] ?? null;

  const countdownLabel = useMemo(() => {
    if (!nextTrip?.start_date) return null;
    const start = nextTrip.start_date.slice(0, 10);
    const startMs = Date.parse(`${start}T12:00:00Z`);
    if (!Number.isFinite(startMs)) return null;
    if (start <= today && (nextTrip.end_date || "").slice(0, 10) >= today) {
      return "Trip in progress";
    }
    const days = Math.ceil((startMs - Date.now()) / 86_400_000);
    if (days <= 0) return "Starting soon";
    if (days === 1) return "1 day to go";
    return `${days} days to go`;
  }, [nextTrip, today]);

  const yearRoundCards = [
    {
      href: "/wishlist",
      title: "Collections",
      body: "Save places from Reels or notes — they attach to Future Trips.",
    },
    {
      href: "/inspiration",
      title: "Inspiration",
      body: "Browse destinations from the Discover catalog.",
    },
    {
      href: "/archive",
      title: "Archive",
      body: "Revisit past trips after their end date.",
    },
    {
      href: "/future-plans",
      title: "Future Trips",
      body: "Hold destinations before tickets exist.",
    },
  ];

  return (
    <div className="space-y-8">
      {isDemo ? <DemoBanner /> : null}

      {/* Hero — countdown when an upcoming trip exists; otherwise year-round entry */}
      <section className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-8 shadow-[0_6px_18px_rgba(8,11,58,0.05)] sm:px-8">
        {nextTrip ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0400FF]">
              Upcoming trip
            </p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#080B3A]">
              {nextTrip.destination.split(",")[0]}
            </h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              {formatTripDate(nextTrip.start_date, "short")} –{" "}
              {formatTripDate(nextTrip.end_date, "long")}
              {countdownLabel ? ` · ${countdownLabel}` : null}
            </p>
            <div className="mt-3">
              <PlanSummary />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <LeavePageLink href={`/trips/${nextTrip.id}`} variant="primary">
                Open itinerary
              </LeavePageLink>
              <LeavePageLink href="/trips/new" variant="secondary">
                <span className="inline-flex items-center gap-2">
                  <IconPlane size={16} />
                  Plan another trip
                </span>
              </LeavePageLink>
              <LeavePageLink href="/future-plans" variant="secondary">
                Already have bookings?
              </LeavePageLink>
              {upcomingTrips.length > 1 ? (
                <Link
                  href="#trips"
                  className="text-sm font-semibold text-[#0400FF] underline-offset-2 hover:underline"
                >
                  {upcomingTrips.length} upcoming trips
                </Link>
              ) : null}
              {isDemo ? (
                <CreateAccountLink className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-[#E1E5F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#1F2937] shadow-sm transition-colors hover:bg-[#DDE1FF]/60">
                  Sign up to save trips
                </CreateAccountLink>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-[28px] font-semibold tracking-tight text-[#080B3A]">
              {trips.length >= 1 ? "Plan your next trip" : "Where next?"}
            </h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              {trips.length >= 1
                ? "No upcoming dated trip right now — open Trip Architect with an idea, or import bookings on Future Trips."
                : "Open Trip Architect with a travel idea. If you already have confirmations, use Future Trips."}
            </p>
            <div className="mt-3">
              <PlanSummary />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <LeavePageLink href="/trips/new" variant="primary">
                <span className="inline-flex items-center gap-2">
                  <IconPlane size={16} />
                  Plan a trip
                </span>
              </LeavePageLink>
              <LeavePageLink href="/future-plans" variant="secondary">
                Already have bookings?
              </LeavePageLink>
              {trips.length >= 1 ? (
                <LeavePageLink href="/archive" variant="secondary">
                  Travel archive
                </LeavePageLink>
              ) : null}
              {isDemo ? (
                <CreateAccountLink className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-[#E1E5F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#1F2937] shadow-sm transition-colors hover:bg-[#DDE1FF]/60">
                  Sign up to save trips
                </CreateAccountLink>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-6 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
        <h2 className="text-[20px] font-semibold text-[#1F2937]">
          {nextTrip
            ? "Also useful while you plan"
            : "Keep researching year-round"}
        </h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          {nextTrip
            ? "Collections, inspiration, and past trips stay available alongside your countdown."
            : "Useful when you are not packing for a trip yet — collect ideas, browse inspiration, and revisit past trips."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {yearRoundCards.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="group rounded-[12px] border border-[#E1E5F0] px-4 py-3 transition hover:border-[#0400FF]/35"
            >
              <p className="flex items-center justify-between gap-2 font-semibold text-[#080B3A]">
                <span>{entry.title}</span>
                <IconExternalLink
                  size={12}
                  className="shrink-0 text-[#9299B5] opacity-70 transition group-hover:text-[#0400FF] group-hover:opacity-100"
                  aria-hidden
                />
              </p>
              <p className="mt-1 text-sm text-[#6B7280]">{entry.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Search + section */}
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        data-tour="tour-trips-list"
      >
        <div>
          <h2 className="text-[20px] font-semibold text-[#1F2937]">My trips</h2>
          <p className="text-sm text-[#6B7280]">
            Recently planned itineraries and saved journeys.
          </p>
        </div>
        <div className="relative w-full sm:max-w-sm">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9299B5]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search destinations…"
            className="h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white pl-9 pr-3 text-sm focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading trips…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[#E1E5F0] bg-white px-8 py-16 text-center shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DDE1FF] text-[#0400FF]">
            <IconPlane size={22} />
          </div>
          <p className="text-lg font-semibold text-[#1F2937]">No dated trips yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
            Start a Future Trip first — or open the builder if you already have
            dates.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LeavePageLink href="/future-plans" variant="primary">
              Future Trips
            </LeavePageLink>
            <LeavePageLink href="/trips/new" variant="secondary">
              Plan from an idea
            </LeavePageLink>
          </div>
        </div>
      ) : (
        <div id="trips" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {deleteError ? (
            <p className="sm:col-span-2 xl:col-span-3 text-sm text-[#B91C1C]">
              {deleteError}
            </p>
          ) : null}
          {isDemo || trips.length >= 1 ? <CreateTripPreviewCard /> : null}
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
      href="/future-plans"
      className="group flex flex-col overflow-hidden rounded-[14px] border border-dashed border-[#0400FF]/35 bg-white shadow-[0_4px_20px_rgba(8,11,58,0.05)] transition hover:-translate-y-0.5 hover:border-[#0400FF] hover:shadow-[0_12px_32px_rgba(8,11,58,0.1)]"
    >
      <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-[#DDE1FF] via-[#F5F7FF] to-white">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0400FF] text-white shadow-lg shadow-[#0400FF]/30 transition group-hover:scale-105">
          <IconPlane size={26} />
        </div>
        <span className="absolute right-3 top-3 rounded-md bg-[#080B3A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Next trip
        </span>
      </div>
      <div className="flex flex-1 flex-col space-y-1.5 p-4">
        <h3 className="text-[16px] font-semibold text-[#1F2937]">
          Start another Future Trip
        </h3>
        <p className="text-sm text-[#6B7280]">
          Hold the next destination before tickets exist — dates can come later.
        </p>
        <span className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-[#0400FF] group-hover:gap-2">
          Open Future Trips <IconArrowRight size={14} />
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
    <article className="group overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_4px_20px_rgba(8,11,58,0.05)] transition hover:-translate-y-0.5 hover:border-[#0400FF]/25 hover:shadow-[0_12px_32px_rgba(8,11,58,0.1)]">
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
            Sample
          </span>
        ) : null}
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
