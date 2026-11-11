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

  if (!bookedHotels.length && !flights.length && !flightNumber) {
    return null;
  }

  return (
    <section
      id="bookings"
      className="space-y-2 rounded-[14px] border border-[#E1E5F0] bg-white p-3"
    >
      <h2 className="text-sm font-semibold text-[#080B3A]">Bookings</h2>

      {flightNumber || onApplyDelay ? (
        <FlightStatusChip
          flightNumber={flightNumber}
          date={flightDate}
          manualArrival={manualArrival}
          onApplyDelay={onApplyDelay}
        />
      ) : null}

      {bookedHotels.length ? (
        <ul className="space-y-1.5">
          {bookedHotels.map((leg, i) => (
            <li
              key={`${leg.city}-${i}`}
              className="rounded-[10px] border border-[#ECFDF5] bg-[#F0FDF4] px-3 py-2 text-sm"
            >
              <p className="font-medium text-[#080B3A]">{leg.hotel}</p>
              <p className="text-xs text-[#6B7280]">{leg.city}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {flights.length ? (
        <ul className="space-y-1.5">
          {flights.map((a) => (
            <li
              key={a.id}
              className="rounded-[10px] border border-[#F0F2F8] px-3 py-2 text-sm"
            >
              <p className="font-medium text-[#080B3A]">{a.name}</p>
              <p className="text-xs text-[#6B7280]">
                {[a.start_time?.slice(0, 5), a.end_time?.slice(0, 5)]
                  .filter(Boolean)
                  .join(" – ")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
