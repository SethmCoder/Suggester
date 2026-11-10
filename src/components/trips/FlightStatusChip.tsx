"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Status = {
  found: boolean;
  flightNumber: string;
  airline: string | null;
  fromIata: string | null;
  toIata: string | null;
  arrivalTime: string | null;
  status: string | null;
  delayMinutes: number | null;
  delayed: boolean;
  rawNote?: string;
};

export function FlightStatusChip({
  flightNumber,
  date,
  manualArrival,
  onApplyDelay,
}: {
  flightNumber?: string | null;
  date?: string | null;
  manualArrival?: string | null;
  onApplyDelay?: (minutes: number) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [manualDelay, setManualDelay] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!flightNumber?.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ flight: flightNumber.trim() });
      if (date) params.set("date", date);
      const res = await fetch(`/api/flights/status?${params}`);
      const data = (await res.json()) as Status;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [flightNumber, date]);

  useEffect(() => {
    void refresh();
    if (!flightNumber?.trim()) return;
    const id = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [flightNumber, refresh]);

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
            {status?.found
              ? [
                  status.airline,
                  status.fromIata && status.toIata
                    ? `${status.fromIata} → ${status.toIata}`
                    : null,
                  status.arrivalTime
                    ? `~${status.arrivalTime}`
                    : null,
                  status.status,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : manualArrival
                ? `Manual arrival ${manualArrival}`
                : status?.rawNote ||
                  (loading ? "Checking status…" : "Status unavailable")}
          </p>
        </div>
        {status?.delayed ? (
          <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#B91C1C]">
            Delayed
            {status.delayMinutes != null ? ` ${status.delayMinutes}m` : ""}
          </span>
        ) : status?.found ? (
          <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#047857]">
            On track
          </span>
        ) : null}
      </div>

      {status?.delayed && status.delayMinutes != null && onApplyDelay ? (
        <Button
          type="button"
          className="mt-3"
          onClick={() => onApplyDelay(status.delayMinutes!)}
        >
          Reschedule day for {status.delayMinutes}m delay
        </Button>
      ) : null}

      {!status?.found && onApplyDelay ? (
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
          {flightNumber ? (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => void refresh()}
            >
              Refresh status
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
