import { evidencePackFromBookings } from "@/lib/dreamer/evidence-pack";
import { datesFromDreamAndBooking } from "@/lib/dreamer/materialize";
import type { DreamerBooking } from "@/lib/dreamer/types";
import type { FutureTrip } from "@/lib/future-trips/types";
import { getPreferredLanguageClient } from "@/lib/i18n/preference";
import {
  createOfflineTripId,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import { offlineSnapshotShell } from "@/lib/trips/offline-from-generated";

/**
 * Demo / offline path: turn Future Trip + local booking evidence into an
 * on-device itinerary shell (filled by pendingBuild → demo-create).
 */
export function materializeFutureTripLocally(input: {
  trip: FutureTrip;
  bookings: DreamerBooking[];
}): { tripId: string; redirect: string } | { error: string; code?: string } {
  const evidence = evidencePackFromBookings(
    input.bookings.map((b) => ({
      kind: b.kind,
      parsed: b.parsed,
      title: b.title,
    })),
  );
  if (!evidence.ready) {
    return {
      error:
        "Paste a real confirmation first — Waypoint only builds trips from booking evidence.",
      code: "evidence_required",
    };
  }

  const parsed = evidence.flight ?? evidence.hotel;
  if (!parsed) {
    return { error: "No booking evidence", code: "evidence_required" };
  }

  const dates = datesFromDreamAndBooking({
    booking: parsed,
    potentialStart: input.trip.potentialStart,
    potentialEnd: input.trip.potentialEnd,
    estimatedDurationDays: input.trip.estimatedDurationDays,
  });

  const city =
    input.trip.destination.split("→")[0]?.trim() || input.trip.destination;
  const provenance = evidence.provenance.length
    ? `Evidence: ${evidence.provenance.join(" · ")}.`
    : "";
  const idealTrip = [input.trip.notes?.trim() || "", provenance]
    .filter(Boolean)
    .join(" ")
    .trim();

  const budgetTotal =
    typeof input.trip.budget === "number" && input.trip.budget > 0
      ? input.trip.budget
      : undefined;
  const currency = input.trip.currency || "USD";
  const language =
    typeof window !== "undefined" ? getPreferredLanguageClient() : "en";

  const legs = [
    {
      city,
      days: dates.nights + 1,
      nights: dates.nights,
      arrivalDate: dates.startDate,
      departureDate: dates.endDate,
      hotel: evidence.hotelName,
      hotelBooked: Boolean(evidence.hotelName),
    },
  ];

  const pendingBuild = {
    destination: input.trip.destination,
    startDate: dates.startDate,
    endDate: dates.endDate,
    originAirport: evidence.fromIata,
    destinationAirport: evidence.toIata,
    travelers: input.trip.travelers ?? 2,
    budget: budgetTotal,
    currency,
    budgetAllocation: "sights" as const,
    interests: input.trip.interests?.length
      ? input.trip.interests
      : ["food", "culture"],
    intensity: "balanced",
    transport: input.trip.transport || "transit",
    idealTrip,
    tripTitle: input.trip.title || undefined,
    hotel: evidence.hotelName,
    flightNumber: evidence.flightNumber,
    arrivalLocal: evidence.arrivalLocal,
    // Keep sightseeing day start morning; arrivalLocal is applied to the flight stop.
    dayStart: "09:00",
    dayEnd: "21:00",
    language,
    mustSee: [] as string[],
    preferred: [] as string[],
    avoid: [] as string[],
    optional: [] as string[],
    futureTripId: input.trip.id,
    legs,
  };

  const tripId = createOfflineTripId();
  saveOfflineTrip(
    offlineSnapshotShell({
      tripId,
      destination: input.trip.destination,
      startDate: dates.startDate,
      endDate: dates.endDate,
      dayCount: dates.nights + 1,
      legs: legs as import("@/lib/types/trip").TripLeg[],
      title: input.trip.title || undefined,
      budget: {
        total: budgetTotal,
        currency,
        allocation: "sights",
      },
      pendingBuild,
    }),
  );

  return { tripId, redirect: `/trips/${tripId}` };
}
