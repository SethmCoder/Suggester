"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ItineraryEditor } from "@/components/itinerary/ItineraryEditor";
import { getDemoTripPayload, isDemoTripId } from "@/lib/demo/data";
import { loadOfflineTrip } from "@/lib/offline/trips";

export function OfflineTripLoader({ tripId }: { tripId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | {
        status: "ready";
        destination: string;
        days: { id: string; day_index: number }[];
        activities: import("@/lib/types/trip").ActivityRow[];
        startDate?: string;
        endDate?: string;
        isDemo: boolean;
      }
  >({ status: "loading" });

  useEffect(() => {
    if (isDemoTripId(tripId)) {
      const data = getDemoTripPayload(tripId);
      const offline = loadOfflineTrip(tripId);
      setState({
        status: "ready",
        destination: `${data.trip.destination} (Demo)`,
        days: offline?.days ?? data.days,
        activities: offline?.activities ?? data.activities,
        startDate: data.trip.start_date,
        endDate: data.trip.end_date,
        isDemo: true,
      });
      return;
    }

    const snap = loadOfflineTrip(tripId);
    if (!snap) {
      setState({ status: "missing" });
      return;
    }
    setState({
      status: "ready",
      destination: snap.trip.destination,
      days: snap.days,
      activities: snap.activities,
      startDate: snap.trip.start_date,
      endDate: snap.trip.end_date,
      isDemo: Boolean(snap.offlineOnly) || tripId.startsWith("offline-"),
    });
  }, [tripId]);

  if (state.status === "loading") {
    return (
      <p className="text-sm text-[#6B7280]">Loading saved trip…</p>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="rounded-[14px] border border-[#E1E5F0] bg-white p-6">
        <h1 className="text-lg font-semibold text-[#080B3A]">
          Trip not found offline
        </h1>
        <p className="mt-2 text-sm text-[#6B7280]">
          This itinerary isn&apos;t in local storage and the server is
          unavailable or you&apos;re not signed in.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-semibold text-[#0400FF]"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <ItineraryEditor
      tripId={tripId}
      destination={state.destination}
      initialDays={state.days}
      initialActivities={state.activities}
      isDemo={state.isDemo}
      startDate={state.startDate}
      endDate={state.endDate}
    />
  );
}
