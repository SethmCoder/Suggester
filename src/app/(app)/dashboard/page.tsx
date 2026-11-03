"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { Input } from "@/components/ui/Input";
import type { TripListItem } from "@/lib/types/trip";

export default function DashboardPage() {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trips")
      .then((r) => r.json())
      .then((d) => {
        setTrips(d.trips ?? []);
        setIsDemo(Boolean(d.isDemo));
      })
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => t.destination.toLowerCase().includes(q));
  }, [trips, search]);

  return (
    <div>
      {isDemo ? <DemoBanner /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {isDemo ? "Demo dashboard" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {isDemo
              ? "Open the sample Paris itinerary to explore the editor and map."
              : "Plan personalized, route-aware itineraries."}
          </p>
        </div>
        {isDemo ? (
          <Link
            href="/signup"
            className="inline-flex justify-center rounded-lg bg-[#1616C9] px-4 py-2 text-sm font-medium text-white hover:bg-[#1010A3]"
          >
            Sign up to create real trips
          </Link>
        ) : (
          <Link
            href="/trips/new"
            className="inline-flex justify-center rounded-lg bg-[#1616C9] px-4 py-2 text-sm font-medium text-white hover:bg-[#1010A3]"
          >
            Create a Trip
          </Link>
        )}
      </div>

      <div className="mt-8">
        <Input
          placeholder="Search trips…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-[#6B7280]">Loading trips…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[#E5E7EB] bg-white p-12 text-center">
          <p className="text-lg font-medium">No trips yet</p>
          <p className="mt-2 text-sm text-[#6B7280]">
            Create your first itinerary to see it here.
          </p>
          <Link
            href="/trips/new"
            className="mt-6 inline-block text-sm font-medium text-[#1616C9] hover:underline"
          >
            Create a Trip
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm transition hover:border-[#1616C9]/30"
    >
      <div className="relative flex h-32 items-end bg-gradient-to-br from-[#EEEEFF] to-white p-4">
        {trip.id === "demo-paris" ? (
          <span className="absolute right-3 top-3 rounded bg-[#B45309] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Demo
          </span>
        ) : null}
        <span className="text-lg font-semibold text-[#1616C9]">
          {trip.destination}
        </span>
      </div>
      <div className="space-y-1 p-4 text-sm">
        <p className="text-[#6B7280]">
          {format(new Date(trip.start_date), "MMM d")} –{" "}
          {format(new Date(trip.end_date), "MMM d, yyyy")}
        </p>
        <p>{days} days</p>
        <p className="text-xs text-[#6B7280]">
          Created {format(new Date(trip.created_at), "MMM d, yyyy")}
        </p>
        <span className="inline-block pt-2 text-sm font-medium text-[#1616C9] group-hover:underline">
          Open itinerary →
        </span>
      </div>
    </Link>
  );
}
