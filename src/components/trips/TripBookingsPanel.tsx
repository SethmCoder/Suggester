"use client";

import type { ActivityRow, TripLeg } from "@/lib/types/trip";
import { FlightStatusChip } from "@/components/trips/FlightStatusChip";

/** Compact bookings strip — only confirmed hotels and real flight/transit blocks. */
export function TripBookingsPanel({
  legs,
  activities,
  flightNumber,
  flightDate,
  manualArrival,
  onApplyDelay,
}: {
  legs: TripLeg[];
  activities: ActivityRow[];
  flightNumber?: string | null;
  flightDate?: string | null;
  manualArrival?: string | null;
  onApplyDelay?: (minutes: number) => void;
}) {
  const bookedHotels = legs.filter((leg) => leg.hotelBooked && leg.hotel?.trim());
  const flights = activities.filter(
    (a) =>
      a.place_id?.startsWith("flight:") ||
      a.place_id?.startsWith("transit:flight"),
  );

  return (
    <section
      id="bookings"
      className="scroll-mt-24 space-y-3 rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_4px_16px_rgba(8,11,58,0.04)]"
    >
      <h2 className="text-sm font-semibold tracking-tight text-[#080B3A]">
        Bookings
      </h2>

      <div id="hotels" className="scroll-mt-24 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9299B5]">
          Hotels
        </p>
        {bookedHotels.length ? (
          <ul className="space-y-1.5">
            {bookedHotels.map((leg, i) => (
              <li
                key={`${leg.city}-${i}`}
                className="rounded-[12px] border border-[#E8F5EE] bg-[#F7FBF8] px-3 py-2.5 text-sm"
              >
                <p className="font-medium text-[#080B3A]">{leg.hotel}</p>
                <p className="mt-0.5 text-xs text-[#6B7280]">{leg.city}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs leading-relaxed text-[#6B7280]">
            No booked hotel yet — add one from the calendar.
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
            No flight or transit blocks yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
