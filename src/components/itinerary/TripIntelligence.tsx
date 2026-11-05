"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ActivityRow } from "@/lib/types/trip";
import type { EngineStop, OptimizeMode } from "@/lib/trips/engine";

function toStops(activities: ActivityRow[]): EngineStop[] {
  return activities.map((activity, index) => ({
    id: activity.id,
    name: activity.name,
    start: (activity.start_time ?? "09:00").slice(0, 5),
    durationMinutes: activity.duration_minutes ?? 60,
    travelMinutesFromPrev: activity.travel_minutes_from_prev,
    lat: activity.lat,
    lng: activity.lng,
    openingHours:
      typeof activity.opening_hours === "string" ? activity.opening_hours : null,
    priority: activity.priority,
    sortOrder: activity.sort_order ?? index,
  }));
}

export function TripIntelligence({
  activities,
  onApplyStart,
}: {
  activities: ActivityRow[];
  onApplyStart?: (activityId: string, start: string) => void;
}) {
  const stops = useMemo(() => toStops(activities), [activities]);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [mode, setMode] = useState<OptimizeMode>("balanced");

  async function run(action: "quality" | "optimize" | "whatif") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trips/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          stops,
          mode,
          previousSignature: action === "quality" ? signature : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not review this day");
      if (action === "quality") {
        setSignature(data.signature ?? null);
        if (data.skipped) {
          setReport("Nothing changed on this day, so it was not scored again.");
        } else {
          const lines = (data.findings ?? []).map(
            (finding: { severity: string; explanation: string }) =>
              `${finding.severity}: ${finding.explanation}`,
          );
          const hours = (data.verification ?? [])
            .map((item: { text: string }) => item.text)
            .filter(Boolean);
          setReport([...lines, ...hours].join("\n") || "No issues found.");
        }
      } else {
        setReport(data.message ?? "Proposal ready. The saved day was not changed.");
        const update = (data.operations ?? []).find(
          (op: { op: string; fields?: { startTime?: string }; activityId?: string }) =>
            op.op === "update" && op.fields?.startTime && op.activityId,
        );
        if (update && onApplyStart) {
          onApplyStart(update.activityId, update.fields.startTime);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review this day");
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
      <h2 className="text-sm font-semibold text-[#1F2937]">Itinerary intelligence</h2>
      <p className="mt-1 text-xs text-[#6B7280]">
        Checks the saved times and coordinates. A proposal is not written onto the trip until you edit a stop yourself.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["balanced", "maximum", "relaxed"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              mode === item
                ? "bg-[#0400FF] text-white"
                : "bg-[#F5F7FF] text-[#1F2937]"
            }`}
          >
            {item === "maximum" ? "Maximum sightseeing" : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => run("quality")}>
          Check this day
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => run("optimize")}>
          Optimize
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => run("whatif")}>
          What if
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-[#DC2626]">{error}</p> : null}
      {report ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-[#1F2937]">{report}</p>
      ) : null}
    </section>
  );
}
