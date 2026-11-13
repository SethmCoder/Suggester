"use client";

import { useMemo, useState } from "react";
import type { ActivityRow, TripLeg } from "@/lib/types/trip";
import { FlightStatusChip } from "@/components/trips/FlightStatusChip";
import { PasteDropZone } from "@/components/dreamer/PasteDropZone";
import { DemoEmailPastePanel } from "@/components/demo/DemoEmailPastePanel";
import { isDemoTripId } from "@/lib/demo/data";
import {
  createFutureTrip,
  listFutureTrips,
  updateFutureTrip,
} from "@/lib/future-trips/store";
import { applyBookingToOfflineTrip } from "@/lib/dreamer/apply-booking-to-trip";
import type { DreamerBooking } from "@/lib/dreamer/types";

/** Compact bookings strip — hotels, flights, and further confirmation upload. */
export function TripBookingsPanel({
  tripId,
  destination,
  legs,
  activities,
  flightNumber,
  flightDate,
  manualArrival,
  onApplyDelay,
  onBookingAdded,
}: {
  tripId?: string;
  destination?: string;
  legs: TripLeg[];
  activities: ActivityRow[];
  flightNumber?: string | null;
  flightDate?: string | null;
  manualArrival?: string | null;
  onApplyDelay?: (minutes: number) => void;
  onBookingAdded?: () => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [ensuredFutureId, setEnsuredFutureId] = useState<string | null>(null);
  const [insertText, setInsertText] = useState<string | null>(null);
  const [insertRevision, setInsertRevision] = useState(0);

  const isDemo = Boolean(tripId && isDemoTripId(tripId));
  const bookedHotels = legs.filter((leg) => leg.hotelBooked && leg.hotel?.trim());
  const flights = activities.filter(
    (a) =>
      a.place_id?.startsWith("flight:") ||
      a.place_id?.startsWith("transit:flight"),
  );

  const linkedFutureTripId = useMemo(() => {
    if (ensuredFutureId) return ensuredFutureId;
    if (!tripId || typeof window === "undefined") return null;
    try {
      const match = listFutureTrips().find((t) => t.convertedTripId === tripId);
      return match?.id ?? null;
    } catch {
      return null;
    }
  }, [tripId, ensuredFutureId]);

  function ensureFutureTripId(): string | null {
    if (linkedFutureTripId) return linkedFutureTripId;
    if (!tripId || typeof window === "undefined") return null;
    try {
      const existing = listFutureTrips().find((t) => t.convertedTripId === tripId);
      if (existing) {
        setEnsuredFutureId(existing.id);
        return existing.id;
      }
      const city =
        destination?.replace(/\s*\(Demo\)\s*$/i, "").trim() ||
        legs.find((l) => l.city)?.city ||
        "Trip";
      const created = createFutureTrip({
        destination: city,
        title: city,
        status: "planning",
        convertedTripId: tripId,
      });
      setEnsuredFutureId(created.id);
      return created.id;
    } catch {
      return null;
    }
  }

  function openUpload() {
    if (!ensureFutureTripId()) return;
    setShowPaste(true);
  }

  const canUpload = Boolean(tripId);

  return (
    <section
      id="bookings"
      className="scroll-mt-24 space-y-3 rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_4px_16px_rgba(8,11,58,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[#080B3A]">
            Bookings
          </h2>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Flights, hotels, and more confirmations for this trip.
          </p>
        </div>
        {canUpload ? (
          <button
            type="button"
            onClick={() => {
              if (showPaste) {
                setShowPaste(false);
                return;
              }
              openUpload();
            }}
            className="rounded-[10px] bg-[#F5F7FF] px-3 py-1.5 text-xs font-semibold text-[#0400FF] transition hover:bg-[#E8ECFF]"
          >
            {showPaste ? "Hide paste" : "Paste confirmation"}
          </button>
        ) : null}
      </div>

      {isDemo ? (
        <div className="rounded-[12px] border border-dashed border-[#C5CBE8] bg-[#FAFBFF] px-3 py-2.5">
          <p className="text-xs leading-relaxed text-[#4B5563]">
            Email forwarding is not wired up yet. To try booking confirmations
            on this Paris demo, paste email text here — or use a sample
            template below.
          </p>
          {!showPaste && canUpload ? (
            <button
              type="button"
              onClick={openUpload}
              className="mt-2 text-xs font-semibold text-[#0400FF] hover:underline"
            >
              Open paste area
            </button>
          ) : null}
        </div>
      ) : null}

      {showPaste && linkedFutureTripId ? (
        <div className="space-y-3">
          {isDemo ? (
            <DemoEmailPastePanel
              onInsert={(text) => {
                ensureFutureTripId();
                setInsertText(text);
                setInsertRevision((n) => n + 1);
              }}
            />
          ) : null}
          <PasteDropZone
            preferredFutureTripId={linkedFutureTripId}
            compact
            insertText={insertText}
            insertRevision={insertRevision}
            hint={
              isDemo
                ? "Paste works offline in demo — no inbox required. Edit a template above, insert it, then save."
                : undefined
            }
            onDone={(result) => {
              setShowPaste(false);
              const booking = result.booking as DreamerBooking | undefined;
              if (tripId && booking) {
                applyBookingToOfflineTrip(tripId, booking);
              }
              if (tripId && linkedFutureTripId) {
                updateFutureTrip(linkedFutureTripId, {
                  convertedTripId: tripId,
                  status: "planning",
                });
              }
              onBookingAdded?.();
            }}
          />
        </div>
      ) : null}

      {!showPaste && canUpload && !bookedHotels.length && !flights.length && !isDemo ? (
        <button
          type="button"
          onClick={openUpload}
          className="w-full rounded-[12px] border border-dashed border-[#D1D7E5] bg-[#FAFBFF] px-3 py-3 text-left transition hover:border-[#0400FF]/35 hover:bg-[#F5F7FF]"
        >
          <p className="text-sm font-medium text-[#080B3A]">
            Upload another confirmation
          </p>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Paste email text or drop a screenshot — flight, hotel, or rail.
          </p>
        </button>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div id="hotels" className="scroll-mt-24 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9299B5]">
            Hotels
          </p>
          {bookedHotels.length ? (
            <ul className="space-y-1.5">
              {bookedHotels.map((leg, i) => (
                <li
                  key={`${leg.city}-${i}`}
                  className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F7FF] px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-[#080B3A]">{leg.hotel}</p>
                  <p className="mt-0.5 text-xs text-[#6B7280]">{leg.city}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-[#6B7280]">
              {legs.find((l) => l.hotel?.trim())?.hotel
                ? `Suggested stay: ${legs.find((l) => l.hotel?.trim())!.hotel} — paste a hotel confirmation to mark it booked.`
                : "No hotel yet — upload a confirmation or add one on the calendar."}
            </p>
          )}
        </div>

        <div id="transit" className="scroll-mt-24 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9299B5]">
            Flights &amp; transit
          </p>
          {flightNumber || onApplyDelay ? (
            <FlightStatusChip
              flightNumber={flightNumber}
              date={flightDate}
              manualArrival={manualArrival}
              onApplyDelay={onApplyDelay}
            />
          ) : null}
          {flights.length ? (
            <ul className="space-y-1.5">
              {flights.map((a) => (
                <li
                  key={a.id}
                  className="rounded-[12px] border border-[#F0F2F8] px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-[#080B3A]">{a.name}</p>
                  <p className="mt-0.5 text-xs text-[#6B7280]">
                    {[a.start_time?.slice(0, 5), a.end_time?.slice(0, 5)]
                      .filter(Boolean)
                      .join(" – ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : !flightNumber && !onApplyDelay ? (
            <p className="text-xs leading-relaxed text-[#6B7280]">
              No flight or transit blocks yet
              {isDemo ? " — paste a flight confirmation to add one." : "."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
