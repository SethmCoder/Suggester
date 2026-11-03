"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { FirstRunTour } from "@/components/tutorial/FirstRunTour";
import { Button } from "@/components/ui/Button";
import { IconArrowRight, IconPlane, IconSearch } from "@/components/ui/Icons";
import { LocalHeroBackground } from "@/components/home/LocalHero";
import {
  countryFromDestination,
  destinationImageUrl,
} from "@/lib/destination-image";
import { formatTripDate } from "@/lib/format-date";
import { getDemoTripPayload, listDemoTrips } from "@/lib/demo/data";
import {
  listOfflineTrips,
  saveOfflineTrip,
} from "@/lib/offline/trips";
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
  for (const trip of listDemoTrips()) {
    const payload = getDemoTripPayload(trip.id);
    saveOfflineTrip({
      trip: { ...payload.trip, day_count: payload.days.length },
      days: payload.days,
      activities: payload.activities,
      updatedAt: new Date().toISOString(),
    });
  }
}

export default function DashboardPage() {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("traveler");

  useEffect(() => {
    try {
      const u = localStorage.getItem("waypoint:username");
      if (u) setName(u);
    } catch {
      /* ignore */
    }

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
          setName("Seth");
          try {
            seedDemoOffline();
          } catch {
            /* ignore */
          }
          setTrips(mergeTrips(remote.length ? remote : listDemoTrips(), listOfflineTrips()));
        } else {
          setTrips(mergeTrips(remote, offline));
        }
      })
      .catch(() => {
        // Fully offline — show local trips (and demos if any were seeded)
        try {
          const local = listOfflineTrips();
          if (local.length) setTrips(local);
          else {
            seedDemoOffline();
            setTrips(listDemoTrips());
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
    <div className="space-y-8">
      <FirstRunTour />
      {isDemo ? <DemoBanner /> : null}

      {/* Hero */}
      <section className="relative overflow-hidden rounded-[16px] bg-[#10194A] shadow-[0_8px_28px_rgba(8,11,58,0.15)]">
        <LocalHeroBackground opacityClass="opacity-45" showCaption />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080B3A]/95 via-[#10194A]/80 to-[#10194A]/40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <p className="text-sm font-medium text-[#C5CAE5]">Dashboard</p>
          <h1 className="mt-2 max-w-xl text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[32px]">
            Welcome back, {name}! Let&apos;s plan your next adventure.
          </h1>
          <p className="mt-2 max-w-lg text-sm text-[#C5CAE5]">
            Build personalized itineraries, refine them with AI, and keep every
            stop geographically smart.
          </p>
          <Link href={isDemo ? "/signup" : "/trips/new"} className="mt-6 inline-flex">
            <Button>
              <IconPlane size={16} />
              {isDemo ? "Sign up to create trips" : "Create a Trip"}
            </Button>
          </Link>
        </div>
      </section>

      {/* Search + section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
          <p className="text-lg font-semibold text-[#1F2937]">No trips yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
            Create your first itinerary and Waypoint will craft a day-by-day plan
            around your interests and schedule.
          </p>
          <Link
            href={isDemo ? "/trips/demo-paris" : "/trips/new"}
            className="mt-6 inline-flex"
          >
            <Button>
              {isDemo ? "Open Paris demo" : "Create a Trip"}
            </Button>
          </Link>
        </div>
      ) : (
        <div id="trips" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({ trip }: { trip: TripListItem }) {
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
    <Link
      href={`/trips/${trip.id}`}
      className="group overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_4px_20px_rgba(8,11,58,0.05)] transition hover:-translate-y-0.5 hover:border-[#0400FF]/25 hover:shadow-[0_12px_32px_rgba(8,11,58,0.1)]"
    >
      <div className="relative h-40 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/50 to-transparent" />
        {trip.id === "demo-paris" ? (
          <span className="absolute right-3 top-3 rounded-md bg-[#0400FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Demo
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
  );
}
