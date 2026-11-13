"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  DEFAULT_DEMO_FLIGHT_FIELDS,
  DEFAULT_DEMO_HOTEL_FIELDS,
  buildDemoFlightEmail,
  buildDemoHotelEmail,
  type DemoFlightTemplateFields,
  type DemoHotelTemplateFields,
} from "@/lib/demo/email-templates";

type TemplateKind = "flight" | "hotel";

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9299B5]">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full rounded-[8px] border border-[#E1E5F0] bg-white px-2.5 py-1.5 text-sm text-[#080B3A]"
      />
    </label>
  );
}

/** Editable sample emails + insert into the Bookings paste box. */
export function DemoEmailPastePanel({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  const [kind, setKind] = useState<TemplateKind>("flight");
  const [flight, setFlight] = useState<DemoFlightTemplateFields>(
    DEFAULT_DEMO_FLIGHT_FIELDS,
  );
  const [hotel, setHotel] = useState<DemoHotelTemplateFields>(
    DEFAULT_DEMO_HOTEL_FIELDS,
  );

  const preview = useMemo(
    () =>
      kind === "flight"
        ? buildDemoFlightEmail(flight)
        : buildDemoHotelEmail(hotel),
    [kind, flight, hotel],
  );

  return (
    <div className="space-y-3 rounded-[12px] border border-[#DDE1FF] bg-[#F8F9FF] p-3">
      <div>
        <p className="text-sm font-semibold text-[#080B3A]">
          Try with a sample email
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
          Real email forwarding is not available yet — paste a confirmation
          below (or use a template) to try flights, hotels, and rebooking on
          this Paris demo.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["flight", "Flight"],
            ["hotel", "Hotel"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={`rounded-[8px] px-2.5 py-1 text-xs font-semibold transition ${
              kind === id
                ? "bg-[#0400FF] text-white"
                : "bg-white text-[#4B5563] ring-1 ring-[#E1E5F0] hover:bg-[#F5F7FF]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === "flight" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Field
            label="From"
            value={flight.fromIata}
            onChange={(v) =>
              setFlight((f) => ({ ...f, fromIata: v.toUpperCase() }))
            }
            placeholder="SEA"
          />
          <Field
            label="To"
            value={flight.toIata}
            onChange={(v) =>
              setFlight((f) => ({ ...f, toIata: v.toUpperCase() }))
            }
            placeholder="CDG"
          />
          <Field
            label="Flight #"
            value={flight.flightNumber}
            onChange={(v) => setFlight((f) => ({ ...f, flightNumber: v }))}
            placeholder="AF039"
          />
          <Field
            label="Date"
            value={flight.date}
            onChange={(v) => setFlight((f) => ({ ...f, date: v }))}
            placeholder="2026-06-01"
          />
          <Field
            label="Depart"
            value={flight.departureLocal}
            onChange={(v) => setFlight((f) => ({ ...f, departureLocal: v }))}
            placeholder="15:40"
          />
          <Field
            label="Arrive"
            value={flight.arrivalLocal}
            onChange={(v) => setFlight((f) => ({ ...f, arrivalLocal: v }))}
            placeholder="11:10"
          />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field
            label="Hotel name"
            value={hotel.property}
            onChange={(v) => setHotel((h) => ({ ...h, property: v }))}
            className="sm:col-span-2"
            placeholder="Hotel des Grands Boulevards"
          />
          <Field
            label="Check-in"
            value={hotel.checkIn}
            onChange={(v) => setHotel((h) => ({ ...h, checkIn: v }))}
          />
          <Field
            label="Check-out"
            value={hotel.checkOut}
            onChange={(v) => setHotel((h) => ({ ...h, checkOut: v }))}
          />
        </div>
      )}

      <textarea
        readOnly
        value={preview}
        rows={7}
        className="w-full resize-y rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-[#374151]"
        aria-label="Sample confirmation email preview"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onInsert(preview)}>
          Insert into paste box
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(preview);
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          Copy template
        </Button>
      </div>
    </div>
  );
}
