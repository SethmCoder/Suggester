"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function FlightStatusChip({
  flightNumber,
  manualArrival,
  onApplyDelay,
}: {
  flightNumber?: string | null;
  date?: string | null;
  manualArrival?: string | null;
  onApplyDelay?: (minutes: number) => void;
}) {
  const [manualDelay, setManualDelay] = useState("");

  if (!flightNumber?.trim() && !manualArrival) return null;

  return (
    <div className="rounded-[12px] border border-[#EEF2FF] bg-[#F8F9FF] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#3730A3]">
            Inbound flight
          </p>
          <p className="mt-1 text-sm font-semibold text-[#080B3A]">
            {flightNumber?.trim() || "Arrival time only"}
          </p>
          <p className="text-xs text-[#6B7280]">
            {manualArrival
              ? `Arrival ${manualArrival} (from your confirmation)`
              : "Add arrival time from your confirmation email"}
          </p>
        </div>
      </div>

      {onApplyDelay ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase text-[#6B7280]">
              Enter delay (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={manualDelay}
              onChange={(e) => setManualDelay(e.target.value)}
              className="mt-1 w-28 rounded-[8px] border border-[#E1E5F0] px-2 py-1 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!manualDelay || Number(manualDelay) < 1}
            onClick={() => onApplyDelay(Number(manualDelay))}
          >
            Apply delay
          </Button>
        </div>
      ) : null}
    </div>
  );
}
