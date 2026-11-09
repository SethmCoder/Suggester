"use client";

import type { ActivityRow, TripLeg } from "@/lib/types/trip";

export function TripBookingsPanel({
  legs,
  activities,
}: {
  legs: TripLeg[];
  activities: ActivityRow[];
}) {
  const flights = activities.filter(
    (a) =>
      a.place_id?.startsWith("flight:") ||
      a.place_id?.startsWith("transit:flight"),
  );
  const transit = activities.filter(
    (a) =>
      a.place_id?.startsWith("transit:") &&
      !a.place_id.startsWith("transit:flight"),
  );

  return (
    <section
      id="bookings"
      className="space-y-3 rounded-[14px] border border-[#E1E5F0] bg-white p-4 shadow-[0_2px_12px_rgba(8,11,58,0.04)]"
    >
      <div>
        <h2 className="text-sm font-semibold text-[#080B3A]">
          Flights & bookings
        </h2>
        <p className="text-[11px] text-[#6B7280]">
          Confirmed only when you marked a hotel as booked. Everything else is
          suggested — not a reservation.
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
          Hotels
        </p>
        {legs.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No cities yet.</p>
        ) : (
          legs.map((leg, i) => (
            <div
              key={`${leg.city}-${i}`}
              className="flex items-start justify-between gap-2 rounded-[10px] border border-[#F0F2F8] px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-[#080B3A]">
                  {leg.hotel?.trim() || "Hotel not set"}
                </p>
                <p className="text-xs text-[#6B7280]">
                  {leg.city}
                  {leg.arrivalDate && leg.departureDate
                    ? ` · ${leg.arrivalDate} → ${leg.departureDate}`
                    : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  leg.hotelBooked
                    ? "bg-[#ECFDF5] text-[#047857]"
                    : "bg-[#F5F7FF] text-[#0400FF]"
                }`}
              >
                {leg.hotelBooked ? "Confirmed" : "Suggested"}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="space-y-2" id="transit">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
          Flights & transport
        </p>
        {[...flights, ...transit].length === 0 ? (
          <p className="text-sm text-[#6B7280]">
            No flight or transit blocks on the itinerary yet.
          </p>
        ) : (
          [...flights, ...transit].map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-2 rounded-[10px] border border-[#F0F2F8] px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-[#080B3A]">{a.name}</p>
                <p className="text-xs text-[#6B7280]">
                  {a.start_time?.slice(0, 5) ?? "Unscheduled"}
                  {a.address ? ` · ${a.address}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-[#F5F7FF] px-2 py-0.5 text-[10px] font-semibold text-[#0400FF]">
                Suggested
              </span>
            </div>
          ))
        )}
      </div>
      <div id="notes" className="text-xs text-[#9CA3AF]">
        Waypoint does not invent booking confirmations. Forward or mark items
        yourself to treat them as confirmed.
      </div>
    </section>
  );
}
