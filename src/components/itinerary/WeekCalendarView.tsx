"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { formatTripDate } from "@/lib/format-date";
import { addCalendarDays } from "@/lib/trips/dates";
import type { ActivityRow } from "@/lib/types/trip";

const HOUR_START = 6;
const HOUR_END = 23;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START + 1 },
  (_, i) => HOUR_START + i,
);
const HOUR_PX = 48;
const MAX_VISIBLE_DAYS = 7;

type DayColumn = {
  dayId: string;
  dayIndex: number;
  label: string;
  dateLabel: string;
  city?: string;
  activities: ActivityRow[];
};

type DraftSlot = {
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
};

export type CalendarNewStop = {
  dayIndex: number;
  name: string;
  note?: string;
  startTime: string;
  durationMinutes: number;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  useAi?: boolean;
};

function clockMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function formatClock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesToTime(totalMinutes: number): string {
  return `${formatClock(totalMinutes)}:00`;
}

function snapMinutes(raw: number, step = 15): number {
  const clamped = Math.max(
    HOUR_START * 60,
    Math.min(HOUR_END * 60 + 60, raw),
  );
  return Math.round(clamped / step) * step;
}

function yToMinutes(y: number, top: number): number {
  const rel = y - top;
  const hoursFromStart = rel / HOUR_PX;
  return snapMinutes((HOUR_START + hoursFromStart) * 60);
}

function activityTop(activity: ActivityRow): number | null {
  const start = clockMinutes(activity.start_time);
  if (start == null) return null;
  return ((start - HOUR_START * 60) / 60) * HOUR_PX;
}

function activityHeight(activity: ActivityRow): number {
  const start = clockMinutes(activity.start_time) ?? HOUR_START * 60;
  const endClock = clockMinutes(activity.end_time);
  const end =
    endClock != null && endClock > start
      ? endClock
      : start + (activity.duration_minutes ?? 60);
  const px = ((end - start) / 60) * HOUR_PX;
  return Math.max(24, px);
}

function timeOfDayHint(startMinutes: number): string {
  if (startMinutes < 11 * 60) return "breakfast cafe";
  if (startMinutes < 14 * 60) return "lunch restaurant";
  if (startMinutes < 17 * 60) return "museum attraction";
  if (startMinutes < 20 * 60) return "dinner restaurant";
  return "evening bar";
}

export function WeekCalendarView({
  days,
  startDate,
  dayCities,
  onAddStop,
  onSelectActivity,
}: {
  days: DayColumn[];
  startDate?: string;
  dayCities?: { city: string }[];
  onAddStop: (stop: CalendarNewStop) => void | Promise<void>;
  onSelectActivity?: (dayIndex: number, activityId: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(0);
  const [draft, setDraft] = useState<DraftSlot | null>(null);
  const [dragging, setDragging] = useState<DraftSlot | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [askAi, setAskAi] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    name: string;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ dayIndex: number; minutes: number } | null>(
    null,
  );

  const visibleDays = useMemo(
    () => days.slice(weekStart, weekStart + MAX_VISIBLE_DAYS),
    [days, weekStart],
  );
  const canPrev = weekStart > 0;
  const canNext = weekStart + MAX_VISIBLE_DAYS < days.length;
  const gridHeight = HOURS.length * HOUR_PX;

  function closeComposer() {
    setDraft(null);
    setDragging(null);
    setName("");
    setNote("");
    setAskAi(false);
    setAiSuggestion(null);
    dragOrigin.current = null;
  }

  function beginDrag(dayIndex: number, clientY: number, columnTop: number) {
    const minutes = yToMinutes(clientY, columnTop);
    dragOrigin.current = { dayIndex, minutes };
    setDragging({
      dayIndex,
      startMinutes: minutes,
      endMinutes: minutes + 60,
    });
    setDraft(null);
    setAskAi(false);
    setAiSuggestion(null);
  }

  function moveDrag(clientY: number, columnTop: number) {
    if (!dragOrigin.current) return;
    const minutes = yToMinutes(clientY, columnTop);
    const start = Math.min(dragOrigin.current.minutes, minutes);
    const end = Math.max(dragOrigin.current.minutes + 15, minutes);
    setDragging({
      dayIndex: dragOrigin.current.dayIndex,
      startMinutes: start,
      endMinutes: Math.max(start + 15, end),
    });
  }

  function endDrag() {
    if (!dragging) {
      dragOrigin.current = null;
      return;
    }
    const start = Math.min(dragging.startMinutes, dragging.endMinutes);
    const end = Math.max(dragging.startMinutes, dragging.endMinutes);
    setDraft({
      dayIndex: dragging.dayIndex,
      startMinutes: start,
      endMinutes: Math.max(start + 30, end),
    });
    setDragging(null);
    setAskAi(true);
    setName("");
    setNote("");
    setAiSuggestion(null);
    dragOrigin.current = null;
  }

  async function runAiFill() {
    if (!draft) return;
    setAiBusy(true);
    try {
      const city =
        dayCities?.[draft.dayIndex]?.city ||
        days[draft.dayIndex]?.city ||
        "city";
      const q = `${timeOfDayHint(draft.startMinutes)} ${city}`;
      const near = days[draft.dayIndex]?.activities.find(
        (a) => a.lat != null && a.lng != null,
      );
      const params = new URLSearchParams({ q, limit: "5" });
      if (near?.lat != null && near.lng != null) {
        params.set("lat", String(near.lat));
        params.set("lng", String(near.lng));
      }
      const res = await fetch(`/api/places/search?${params}`);
      const data = (await res.json()) as {
        results?: {
          name?: string;
          address?: string;
          lat?: number;
          lng?: number;
        }[];
      };
      const hit = data.results?.[0];
      if (hit?.name) {
        setAiSuggestion({
          name: hit.name,
          address: hit.address ?? null,
          lat: hit.lat ?? null,
          lng: hit.lng ?? null,
        });
        setName(hit.name);
        setNote(
          note ||
            `AI suggestion for ${formatClock(draft.startMinutes)}–${formatClock(draft.endMinutes)}`,
        );
      } else {
        setName((current) => current || `Time in ${city}`);
        setNote(
          (current) =>
            current ||
            `Fill this ${formatClock(draft.startMinutes)}–${formatClock(draft.endMinutes)} slot in ${city}.`,
        );
      }
      setAskAi(false);
    } catch {
      setName((current) => current || "New stop");
      setAskAi(false);
    } finally {
      setAiBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const title = name.trim() || aiSuggestion?.name || "New stop";
    setBusy(true);
    try {
      await onAddStop({
        dayIndex: draft.dayIndex,
        name: title,
        note: note.trim() || undefined,
        startTime: minutesToTime(draft.startMinutes),
        durationMinutes: Math.max(
          15,
          draft.endMinutes - draft.startMinutes,
        ),
        address: aiSuggestion?.address,
        lat: aiSuggestion?.lat,
        lng: aiSuggestion?.lng,
        useAi: Boolean(aiSuggestion),
      });
      closeComposer();
    } finally {
      setBusy(false);
    }
  }

  const activeSlot = draft ?? dragging;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_2px_12px_rgba(8,11,58,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E1E5F0] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#080B3A]">
            Week calendar
          </h2>
          <p className="text-xs text-[#6B7280]">
            Drag on a day from start to end time to add a stop.
          </p>
        </div>
        {days.length > MAX_VISIBLE_DAYS ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setWeekStart((s) => Math.max(0, s - MAX_VISIBLE_DAYS))}
              className="rounded-[10px] border border-[#E1E5F0] px-2.5 py-1 text-xs font-semibold text-[#080B3A] disabled:opacity-40"
            >
              Earlier
            </button>
            <span className="text-xs text-[#6B7280]">
              Days {weekStart + 1}–
              {Math.min(days.length, weekStart + MAX_VISIBLE_DAYS)}
            </span>
            <button
              type="button"
              disabled={!canNext}
              onClick={() =>
                setWeekStart((s) =>
                  Math.min(
                    Math.max(0, days.length - MAX_VISIBLE_DAYS),
                    s + MAX_VISIBLE_DAYS,
                  ),
                )
              }
              className="rounded-[10px] border border-[#E1E5F0] px-2.5 py-1 text-xs font-semibold text-[#080B3A] disabled:opacity-40"
            >
              Later
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div
          ref={gridRef}
          className="grid min-w-[720px]"
          style={{
            gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr)) 52px`,
          }}
        >
          {visibleDays.map((day) => {
            const dateIso = startDate
              ? addCalendarDays(startDate, day.dayIndex)
              : null;
            return (
              <div
                key={day.dayId}
                className="border-r border-[#E1E5F0] px-2 py-2 text-center"
              >
                <p className="text-xs font-semibold text-[#080B3A]">
                  {day.label}
                </p>
                <p className="text-[11px] text-[#6B7280]">
                  {dateIso ? formatTripDate(dateIso, "short") : day.dateLabel}
                </p>
                {day.city || dayCities?.[day.dayIndex]?.city ? (
                  <p className="truncate text-[10px] text-[#0400FF]">
                    {day.city || dayCities?.[day.dayIndex]?.city}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="px-1 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Time
          </div>

          {visibleDays.map((day) => (
            <div
              key={`${day.dayId}-grid`}
              className="relative select-none border-r border-[#E1E5F0] bg-[#FAFBFF]"
              style={{ height: gridHeight }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("[data-activity]")) return;
                const rect = (
                  e.currentTarget as HTMLDivElement
                ).getBoundingClientRect();
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                beginDrag(day.dayIndex, e.clientY, rect.top);
              }}
              onPointerMove={(e) => {
                if (!dragOrigin.current) return;
                if (dragOrigin.current.dayIndex !== day.dayIndex) return;
                const rect = (
                  e.currentTarget as HTMLDivElement
                ).getBoundingClientRect();
                moveDrag(e.clientY, rect.top);
              }}
              onPointerUp={() => endDrag()}
              onPointerCancel={() => {
                setDragging(null);
                dragOrigin.current = null;
              }}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="pointer-events-none border-b border-[#E8ECF5]"
                  style={{ height: HOUR_PX }}
                />
              ))}

              {day.activities.map((activity) => {
                const top = activityTop(activity);
                if (top == null) return null;
                return (
                  <button
                    key={activity.id}
                    type="button"
                    data-activity
                    onClick={() => onSelectActivity?.(day.dayIndex, activity.id)}
                    className="absolute left-1 right-1 z-[1] overflow-hidden rounded-[8px] border border-[#0400FF]/25 bg-[#0400FF] px-1.5 py-1 text-left text-[10px] font-medium text-white shadow-sm"
                    style={{
                      top,
                      height: activityHeight(activity),
                    }}
                    title={activity.name}
                  >
                    <span className="block truncate">{activity.name}</span>
                    <span className="block opacity-80">
                      {(activity.start_time ?? "").slice(0, 5)}
                      {activity.duration_minutes
                        ? ` · ${activity.duration_minutes}m`
                        : ""}
                    </span>
                  </button>
                );
              })}

              {activeSlot && activeSlot.dayIndex === day.dayIndex ? (
                <div
                  className="pointer-events-none absolute left-1 right-1 z-[2] rounded-[8px] border-2 border-dashed border-[#0400FF] bg-[#0400FF]/15"
                  style={{
                    top:
                      ((Math.min(
                        activeSlot.startMinutes,
                        activeSlot.endMinutes,
                      ) -
                        HOUR_START * 60) /
                        60) *
                      HOUR_PX,
                    height: Math.max(
                      24,
                      ((Math.abs(
                        activeSlot.endMinutes - activeSlot.startMinutes,
                      ) || 60) /
                        60) *
                        HOUR_PX,
                    ),
                  }}
                />
              ) : null}
            </div>
          ))}

          <div
            className="relative bg-white"
            style={{ height: gridHeight }}
            aria-hidden
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="flex items-start justify-end border-b border-transparent pr-2 text-[10px] font-medium text-[#6B7280]"
                style={{ height: HOUR_PX }}
              >
                {`${String(hour).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
        </div>
      </div>

      {draft ? (
        <div className="border-t border-[#E1E5F0] bg-[#F5F7FF] px-4 py-3">
          <div className="mx-auto max-w-md rounded-[12px] border border-[#E1E5F0] bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold text-[#080B3A]">
              Day {draft.dayIndex + 1} · {formatClock(draft.startMinutes)}–
              {formatClock(draft.endMinutes)}
            </p>
            {askAi ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-[#4B5563]">Use AI to fill?</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void runAiFill()}
                  >
                    {aiBusy ? "Finding a place…" : "Yes, use AI"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAskAi(false)}
                  >
                    I’ll type it
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={closeComposer}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div>
                  <Label>Place</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Museum, cafe, hotel…"
                    autoFocus
                  />
                </div>
                <div>
                  <Label>Note</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional detail"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    disabled={busy || (!name.trim() && !aiSuggestion)}
                    onClick={() => void saveDraft()}
                  >
                    {busy ? "Saving…" : "Add stop"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={aiBusy}
                    onClick={() => void runAiFill()}
                  >
                    {aiBusy ? "Finding…" : "Use AI to fill"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={closeComposer}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
