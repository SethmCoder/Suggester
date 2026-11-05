"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ItineraryEditor } from "@/components/itinerary/ItineraryEditor";
import {
  DEMO_CONTENT_VERSION,
  getDemoTripPayload,
  isDemoTripId,
} from "@/lib/demo/data";
import { loadOfflineTrip, saveOfflineTrip } from "@/lib/offline/trips";
import { expandLegsToDays, type DayCityAssignment } from "@/lib/trips/legs";

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
        dayCities?: DayCityAssignment[];
        legs?: import("@/lib/types/trip").TripLeg[];
      }
  >({ status: "loading" });

  useEffect(() => {
    if (isDemoTripId(tripId)) {
      const data = getDemoTripPayload(tripId);
      const offline = loadOfflineTrip(tripId);
      const offlineFresh =
        offline &&
        offline.contentVersion === DEMO_CONTENT_VERSION &&
        offline.trip.destination === data.trip.destination;
      // Always refresh canonical demo into local storage so stale Paris
      // copies under demo-dubai cannot linger.
      saveOfflineTrip({
        trip: { ...data.trip, day_count: data.days.length },
        days: data.days,
        activities: offlineFresh ? offline.activities : data.activities,
        updatedAt: new Date().toISOString(),
        contentVersion: DEMO_CONTENT_VERSION,
        legs: data.legs,
      });
      setState({
        status: "ready",
        destination: `${data.trip.destination} (Demo)`,
        days: data.days,
        activities: offlineFresh ? offline.activities : data.activities,
        startDate: data.trip.start_date,
        endDate: data.trip.end_date,
        isDemo: true,
        dayCities: data.dayCities,
        legs: data.legs,
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
        dayCities: snap.legs?.length ? expandLegsToDays(snap.legs) : undefined,
        legs: snap.legs,
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
      dayCities={state.dayCities}
      initialLegs={state.legs}
    />
  );
}
