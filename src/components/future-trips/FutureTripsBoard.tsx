"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconPlane } from "@/components/ui/Icons";
import { destinationImageUrl } from "@/lib/destination-image";
import {
  FUTURE_TRIP_STATUSES,
  statusLabel,
  type FutureTrip,
  type FutureTripStatus,
} from "@/lib/future-trips/types";
import {
  loadFutureTrips,
  removeFutureTrip,
  saveFutureTrip,
  startPlanning,
} from "@/lib/future-trips/sync";
import { listItems } from "@/lib/wishlist/store";

export function FutureTripsBoard() {
  const [trips, setTrips] = useState<FutureTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [destination, setDestination] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("5");
  const [travelers, setTravelers] = useState("2");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await loadFutureTrips();
      setTrips(data.trips);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load future trips");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visible = useMemo(
    () =>
      trips.filter((trip) => statusFilter === "all" || trip.status === statusFilter),
    [trips, statusFilter],
  );

  async function createProject() {
    if (!destination.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const matching = listItems().filter((item) => {
        const hay = `${item.location ?? ""} ${item.address ?? ""}`.toLowerCase();
        return hay.includes(destination.trim().toLowerCase());
      });
      const trip = await saveFutureTrip({
        destination: destination.trim(),
        title: title.trim() || null,
        notes: notes.trim() || null,
        estimatedDurationDays: Number(duration) || null,
        travelers: Number(travelers) || null,
        budget: budget ? Number(budget) : null,
        status: "wishlist",
        wishlistItemIds: matching.map((item) => item.id),
        interests: [],
      });
      setTrips((current) => [trip, ...current.filter((row) => row.id !== trip.id)]);
      setDestination("");
      setTitle("");
      setNotes("");
      setBudget("");
      setMessage(
        matching.length
          ? `Created with ${matching.length} matching wishlist item${matching.length === 1 ? "" : "s"} ready to review.`
          : "Project created. Exact dates are optional until you start planning.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function convert(trip: FutureTrip) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await startPlanning(trip.id);
      if (result.alreadyConverted && result.tripId) {
        window.location.href = result.redirect;
        return;
      }
      window.location.href = result.redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start planning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">Future trips</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#6B7280]">
            Hold potential vacations before dates are locked. Attach wishlist places, compare ideas, then start planning when you are ready.
          </p>
        </div>
        <Link href="/wishlist">
          <Button variant="secondary">Open wishlist</Button>
        </Link>
      </div>

      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F6FF] px-4 py-3 text-sm text-[#080B3A]">
          {message}
        </p>
      ) : null}

      <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
        <h2 className="text-sm font-semibold text-[#080B3A]">New trip project</h2>
        <p className="mt-1 text-sm text-[#6B7280]">Dates are optional. You can fill them in later.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Destination"
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Working title (optional)"
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          />
          <input
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="Estimated days"
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          />
          <input
            value={travelers}
            onChange={(event) => setTravelers(event.target.value)}
            placeholder="Travelers"
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          />
          <input
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            placeholder="Budget amount (optional)"
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          />
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notes"
            rows={2}
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm md:col-span-2"
          />
        </div>
        <div className="mt-3">
          <Button type="button" onClick={() => void createProject()} disabled={busy || !destination.trim()}>
            Create project
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`rounded-full px-3 py-1.5 text-sm ${statusFilter === "all" ? "bg-[#0400FF] text-white" : "bg-white border border-[#E1E5F0]"}`}
        >
          All
        </button>
        {FUTURE_TRIP_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1.5 text-sm ${statusFilter === status ? "bg-[#0400FF] text-white" : "bg-white border border-[#E1E5F0]"}`}
          >
            {statusLabel(status as FutureTripStatus)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
          Loading future trips…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-8 py-16 text-center shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DDE1FF] text-[#0400FF]">
            <IconPlane size={22} />
          </div>
          <p className="text-lg font-semibold">No future trips yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
            Start a project for a place you want to visit. You do not need exact dates.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((trip) => (
            <li
              key={trip.id}
              className="overflow-hidden rounded-[16px] border border-[#E1E5F0] bg-white shadow-[0_4px_20px_rgba(8,11,58,0.04)]"
            >
              <div className="h-32 bg-[#080B3A]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={trip.coverImageUrl || destinationImageUrl(trip.destination)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#0400FF]">
                    {statusLabel(trip.status)}
                  </p>
                  <h2 className="text-lg font-semibold text-[#1F2937]">
                    {trip.title || trip.destination}
                  </h2>
                  <p className="text-sm text-[#6B7280]">{trip.destination}</p>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs text-[#4B5563]">
                  <div>
                    <dt className="text-[#6B7280]">Dates</dt>
                    <dd>
                      {trip.potentialStart || trip.potentialEnd
                        ? `${trip.potentialStart || "Open"} → ${trip.potentialEnd || "Open"}`
                        : "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#6B7280]">Duration</dt>
                    <dd>
                      {trip.estimatedDurationDays
                        ? `${trip.estimatedDurationDays} days`
                        : "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#6B7280]">Travelers</dt>
                    <dd>{trip.travelers ?? "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="text-[#6B7280]">Saved places</dt>
                    <dd>{trip.wishlistItemIds.length}</dd>
                  </div>
                </dl>
                {trip.notes ? (
                  <p className="line-clamp-2 text-sm text-[#4B5563]">{trip.notes}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/future-trips/${trip.id}`}>
                    <Button variant="secondary">Open</Button>
                  </Link>
                  {trip.convertedTripId ? (
                    <Link href={`/trips/${trip.convertedTripId}`}>
                      <Button>Open active trip</Button>
                    </Link>
                  ) : (
                    <Button type="button" onClick={() => void convert(trip)} disabled={busy}>
                      Start planning
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (!window.confirm(`Delete project for ${trip.destination}?`)) return;
                      void removeFutureTrip(trip.id).then(() =>
                        setTrips((current) => current.filter((row) => row.id !== trip.id)),
                      );
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
