"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { formatTripDate } from "@/lib/format-date";
import { addCalendarDays } from "@/lib/trips/dates";
import type { ActivityRow } from "@/lib/types/trip";
import { stopColorForIndex, stopColorForKey } from "@/lib/trips/stop-colors";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { getPreferredLanguageClient } from "@/lib/i18n/preference";
import type { PlaceCategory } from "@/lib/places/types";
import type { DayCityAssignment } from "@/lib/trips/legs";
import { HotelChoice } from "@/components/trips/HotelChoice";
import type { HotelPlacePreference } from "@/lib/hotels/hotelrec";
import {
  bookedHotelForDay,
  legForDay,
} from "@/lib/trips/calendar-hotel";
import {
  LockedTimedStopForm,
  type LockedTimedStopInput,
} from "./LockedTimedStopForm";
import { calendarStopFromLockedInput } from "@/lib/trips/locked-stop";
import type { TripLeg } from "@/lib/types/trip";

type ComposerMode = "find" | "manual";
type ComposerKind = "place" | "meeting" | "transport";

type PlaceHit = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: PlaceCategory;
};

function categoryLabel(category?: PlaceCategory): string {
  if (!category || category === "other") return "";
  return category.replace(/_/g, " ");
}

const HOUR_START = 8;
const HOUR_END = 20;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START + 1 },
  (_, i) => HOUR_START + i,
);
const HOUR_PX = 36;
const MAX_VISIBLE_DAYS = 3;

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
  endTime?: string;
  durationMinutes: number;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  useAi?: boolean;
  stopKind?: "place" | "meeting" | "transport" | "attraction";
  place_id?: string | null;
  transportFrom?: string;
  transportTo?: string;
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

function findHereSearchQuery(city: string, startMinutes: number): string {
  if (startMinutes < 11 * 60) {
    return `things to do museum attraction park ${city}`;
  }
  if (startMinutes < 14 * 60) {
    return `things to do attraction museum historic ${city}`;
  }
  if (startMinutes < 17 * 60) {
    return `things to do museum attraction viewpoint ${city}`;
  }
  if (startMinutes < 20 * 60) {
    return `things to do attraction restaurant shopping ${city}`;
  }
  return `things to do entertainment restaurant ${city}`;
}

export function WeekCalendarView({
  days,
  startDate,
  dayCities,
  legs,
  onAddStop,
  onSelectActivity,
  onUpdateLeg,
}: {
  days: DayColumn[];
  startDate?: string;
  dayCities?: DayCityAssignment[];
  legs?: TripLeg[];
  onAddStop: (stop: CalendarNewStop) => void | Promise<void>;
  onSelectActivity?: (dayIndex: number, activityId: string) => void;
  onUpdateLeg?: (legIndex: number, patch: Partial<TripLeg>) => void;
}) {
  const { t, language } = useLanguage();
  const [weatherByDate, setWeatherByDate] = useState<Record<string, string>>(
    {},
  );
  const [weekStart, setWeekStart] = useState(0);

  useEffect(() => {
    if (!startDate || !days.length) return;
    const endDate = addCalendarDays(startDate, days.length - 1);
    const city =
      dayCities?.[0]?.city ||
      legs?.[0]?.city ||
      days[0]?.city ||
      "";
    if (!city) return;
    let cancelled = false;
    void fetch(
      `/api/weather?city=${encodeURIComponent(city)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    )
      .then((r) => r.json())
      .then(
        (data: {
          days?: { date: string; label?: string; tempMaxC?: number | null }[];
        }) => {
          if (cancelled || !Array.isArray(data.days)) return;
          const next: Record<string, string> = {};
          for (const day of data.days) {
            const bits = [
              day.label,
              day.tempMaxC != null ? `${Math.round(day.tempMaxC)}°` : null,
            ].filter(Boolean);
            if (bits.length) next[day.date] = bits.join(" · ");
          }
          setWeatherByDate(next);
        },
      )
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [startDate, days, dayCities, legs]);
  const [draft, setDraft] = useState<DraftSlot | null>(null);
  const [dragging, setDragging] = useState<DraftSlot | null>(null);
  const [mode, setMode] = useState<ComposerMode>("find");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<PlaceHit[]>([]);
  const [picked, setPicked] = useState<PlaceHit | null>(null);
  const [composerKind, setComposerKind] = useState<ComposerKind>("place");
  const [lockedDayIndex, setLockedDayIndex] = useState(0);
  const [lockedFormOpen, setLockedFormOpen] = useState(false);
  const [hotelSuggestLeg, setHotelSuggestLeg] = useState<number | null>(null);
  const [hotelBrand, setHotelBrand] = useState("");
  const [hotelMinRating, setHotelMinRating] = useState(4);
  const [hotelPlace, setHotelPlace] = useState<HotelPlacePreference>("any");
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
    setComposerKind("place");
    setMode("find");
    setName("");
    setNote("");
    setSearchQuery("");
    setSearchResults([]);
    setAiSuggestions([]);
    setPicked(null);
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
    setMode("find");
    setAiSuggestions([]);
    setPicked(null);
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
    setMode("find");
    setName("");
    setNote("");
    setSearchQuery("");
    setSearchResults([]);
    setAiSuggestions([]);
    setPicked(null);
    dragOrigin.current = null;
  }

  const draftNear = useMemo(() => {
    if (!draft) return null;
    const leg = dayCities?.[draft.dayIndex];
    if (
      leg?.anchorLat != null &&
      leg.anchorLng != null &&
      Number.isFinite(leg.anchorLat) &&
      Number.isFinite(leg.anchorLng) &&
      (leg.anchorLat !== 0 || leg.anchorLng !== 0)
    ) {
      return { lat: leg.anchorLat, lng: leg.anchorLng };
    }
    const hit = days[draft.dayIndex]?.activities.find(
      (a) => a.lat != null && a.lng != null,
    );
    if (hit?.lat == null || hit.lng == null) return null;
    return { lat: hit.lat, lng: hit.lng };
  }, [draft, days, dayCities]);

  useEffect(() => {
    if (!draft || mode !== "manual") {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q, limit: "6" });
      if (draftNear) {
        params.set("lat", String(draftNear.lat));
        params.set("lng", String(draftNear.lng));
      }
      void fetch(`/api/places/search?${params}`)
        .then((res) => res.json())
        .then((data: { results?: PlaceHit[] }) =>
          setSearchResults(data.results ?? []),
        )
        .catch(() => setSearchResults([]));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [draft, mode, searchQuery, draftNear]);

  async function runFindHere() {
    if (!draft) return;
    setAiBusy(true);
    setAiSuggestions([]);
    try {
      const city =
        dayCities?.[draft.dayIndex]?.city ||
        days[draft.dayIndex]?.city ||
        "";
      const params = new URLSearchParams({
        limit: "6",
        startMinutes: String(draft.startMinutes),
        lang: language || getPreferredLanguageClient(),
      });
      if (city) params.set("city", city);
      if (draftNear) {
        params.set("lat", String(draftNear.lat));
        params.set("lng", String(draftNear.lng));
      }
      const res = await fetch(`/api/places/slot-suggest?${params}`);
      const data = (await res.json()) as {
        results?: PlaceHit[];
        notice?: string;
      };
      let hits = (data.results ?? []).filter((hit) => hit.name);

      // Fallback: plain place search around the slot if OSM returned nothing.
      if (!hits.length && city) {
        const fallback = new URLSearchParams({
          q: findHereSearchQuery(city, draft.startMinutes),
          limit: "6",
          lang: language || getPreferredLanguageClient(),
        });
        if (draftNear) {
          fallback.set("lat", String(draftNear.lat));
          fallback.set("lng", String(draftNear.lng));
        }
        const fbRes = await fetch(`/api/places/search?${fallback}`);
        const fbData = (await fbRes.json()) as { results?: PlaceHit[] };
        hits = (fbData.results ?? []).filter((hit) => hit.name);
      }

      setAiSuggestions(hits);
      if (hits[0]) {
        setPicked(hits[0]);
        setName(hits[0].name);
        setNote(
          `${formatClock(draft.startMinutes)}–${formatClock(draft.endMinutes)}${
            city ? ` · ${city}` : ""
          }`,
        );
      } else {
        setNote(data.notice || t("calendar.noMatch"));
      }
    } catch {
      setNote(t("calendar.couldNotFind"));
    } finally {
      setAiBusy(false);
    }
  }

  // Auto-suggest as soon as a slot is dragged open.
  useEffect(() => {
    if (!draft || composerKind !== "place") return;
    void runFindHere();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new draft opens
  }, [draft?.dayIndex, draft?.startMinutes, draft?.endMinutes, composerKind]);

  function pickPlace(hit: PlaceHit, fromAi: boolean) {
    setPicked(hit);
    setName(hit.name);
    if (fromAi) {
      setNote(
        (current) =>
          current ||
          `Suggested for ${formatClock(draft!.startMinutes)}–${formatClock(draft!.endMinutes)}`,
      );
    }
    setSearchQuery("");
    setSearchResults([]);
  }

  async function saveDraft() {
    if (!draft) return;
    const title = name.trim() || picked?.name || "New stop";
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
        address: picked?.address,
        lat: picked?.lat,
        lng: picked?.lng,
        useAi: mode === "find" && Boolean(picked),
      });
      closeComposer();
    } finally {
      setBusy(false);
    }
  }

  const activeSlot = draft ?? dragging;

  async function saveLockedStop(input: LockedTimedStopInput, dayIndex: number) {
    setBusy(true);
    try {
      await onAddStop(calendarStopFromLockedInput(dayIndex, input));
      setLockedFormOpen(false);
      closeComposer();
    } finally {
      setBusy(false);
    }
  }

  const suggestLeg =
    hotelSuggestLeg != null ? legs?.[hotelSuggestLeg] : undefined;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_2px_12px_rgba(8,11,58,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E1E5F0] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#080B3A]">
            {t("calendar.title")}
          </h2>
          <p className="text-xs text-[#6B7280]">{t("calendar.hint")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLockedDayIndex(weekStart);
            setLockedFormOpen(true);
          }}
          className="rounded-[10px] border border-[#0400FF]/35 bg-white px-2.5 py-1 text-xs font-semibold text-[#0400FF] hover:bg-[#EEF1FF]"
        >
          Meeting / transport
        </button>
        {days.length > MAX_VISIBLE_DAYS ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setWeekStart((s) => Math.max(0, s - MAX_VISIBLE_DAYS))}
              className="rounded-[10px] border border-[#E1E5F0] px-2.5 py-1 text-xs font-semibold text-[#080B3A] disabled:opacity-40"
            >
              {t("calendar.earlier")}
            </button>
            <span className="text-xs text-[#6B7280]">
              {t("calendar.days")} {weekStart + 1}–
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
              {t("calendar.later")}
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
                {dateIso && weatherByDate[dateIso] ? (
                  <p
                    className="mt-0.5 truncate rounded-full bg-[#EEF2FF] px-1.5 py-0.5 text-[9px] font-medium text-[#3730A3]"
                    title={weatherByDate[dateIso]}
                  >
                    {weatherByDate[dateIso]}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="px-1 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Time
          </div>

          {visibleDays.map((day) => {
            const booked = bookedHotelForDay({
              dayIndex: day.dayIndex,
              dayCities,
              legs,
              activities: day.activities,
            });
            const legPair = legForDay(day.dayIndex, dayCities, legs);
            return (
              <div
                key={`${day.dayId}-hotel`}
                className="flex min-h-[44px] flex-col justify-center border-r border-[#E1E5F0] bg-[#F5F7FF] px-2 py-1.5"
              >
                {booked ? (
                  <p
                    className="truncate rounded-[8px] bg-[#080B3A] px-2 py-1 text-center text-[10px] font-semibold text-white"
                    title={booked.name}
                  >
                    {booked.name}
                  </p>
                ) : legPair?.leg.city ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHotelSuggestLeg(legPair.legIndex);
                      setHotelBrand(legPair.leg.hotelBrand ?? "");
                      setHotelMinRating(legPair.leg.hotelMinRating ?? 4);
                      setHotelPlace(legPair.leg.hotelPlace ?? "any");
                    }}
                    className="w-full rounded-[8px] border border-dashed border-[#0400FF]/50 bg-white px-1.5 py-1 text-[10px] font-semibold text-[#0400FF] hover:bg-[#EEF1FF]"
                  >
                    Suggest a hotel brand
                  </button>
                ) : null}
              </div>
            );
          })}
          <div className="min-h-[44px] border-[#E1E5F0] bg-[#F5F7FF]" aria-hidden />

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
                const color = day.city
                  ? stopColorForKey(day.city)
                  : stopColorForIndex(day.dayIndex);
                return (
                  <button
                    key={activity.id}
                    type="button"
                    data-activity
                    onClick={() => onSelectActivity?.(day.dayIndex, activity.id)}
                    className="absolute left-1 right-1 z-[1] overflow-hidden rounded-[8px] px-1.5 py-1 text-left text-[10px] font-medium shadow-sm"
                    style={{
                      top,
                      height: activityHeight(activity),
                      background: color.solid,
                      border: `1px solid ${color.border}`,
                      color: color.text,
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
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[#080B3A]/35 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add a stop"
          onClick={closeComposer}
        >
          <div
            className="w-full max-w-md rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_16px_48px_rgba(8,11,58,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#080B3A]">
                  Day {draft.dayIndex + 1} ·{" "}
                  {formatClock(draft.startMinutes)}–
                  {formatClock(draft.endMinutes)}
                </p>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  {dayCities?.[draft.dayIndex]?.city ||
                    days[draft.dayIndex]?.city ||
                    "Add something in this time slot"}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[#6B7280]"
                onClick={closeComposer}
              >
                {t("calendar.close")}
              </button>
            </div>

            <div className="mt-4">
              <div
                className="relative grid grid-cols-3 rounded-full bg-[#EEF1F8] p-1 text-xs font-semibold"
                role="tablist"
                aria-label="Stop type"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-1 top-1 w-[calc(33.333%-4px)] rounded-full bg-white shadow-sm transition-all duration-200"
                  style={{
                    left:
                      composerKind === "place"
                        ? "4px"
                        : composerKind === "meeting"
                          ? "calc(33.333% + 2px)"
                          : "calc(66.666% - 2px)",
                  }}
                />
                {(
                  [
                    ["place", "Place"],
                    ["meeting", "Meeting"],
                    ["transport", "Transport"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={composerKind === kind}
                    className={`relative z-[1] rounded-full px-2 py-2 transition-colors ${
                      composerKind === kind ? "text-[#080B3A]" : "text-[#6B7280]"
                    }`}
                    onClick={() => setComposerKind(kind)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {composerKind !== "place" ? (
              <LockedTimedStopForm
                dayLabel={`Day ${draft.dayIndex + 1}`}
                defaultStart={formatClock(draft.startMinutes)}
                defaultEnd={formatClock(draft.endMinutes)}
                busy={busy}
                onSubmit={(input) => void saveLockedStop(input, draft.dayIndex)}
                onCancel={closeComposer}
              />
            ) : (
              <>
            <Button
              type="button"
              className="mt-4 w-full"
              disabled={aiBusy}
              onClick={() => {
                setMode("find");
                void runFindHere();
              }}
            >
              {aiBusy ? t("calendar.looking") : t("calendar.findHere")}
            </Button>

            <div className="mt-4">
              <div
                className="relative grid grid-cols-2 rounded-full bg-[#EEF1F8] p-1 text-xs font-semibold"
                role="tablist"
                aria-label="How to add this stop"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-all duration-200"
                  style={{
                    left: mode === "manual" ? "calc(50% + 2px)" : "4px",
                  }}
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "find"}
                  className={`relative z-[1] rounded-full px-3 py-2 transition-colors ${
                    mode === "find" ? "text-[#080B3A]" : "text-[#6B7280]"
                  }`}
                  onClick={() => setMode("find")}
                >
                  {t("calendar.findForMe")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "manual"}
                  className={`relative z-[1] rounded-full px-3 py-2 transition-colors ${
                    mode === "manual" ? "text-[#080B3A]" : "text-[#6B7280]"
                  }`}
                  onClick={() => setMode("manual")}
                >
                  {t("calendar.manual")}
                </button>
              </div>
            </div>

            {mode === "find" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-[#6B7280]">{t("calendar.findHint")}</p>
                {aiSuggestions.length ? (
                  <ul className="max-h-44 space-y-1 overflow-auto rounded-[12px] border border-[#E1E5F0]">
                    {aiSuggestions.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-[#F5F7FF] ${
                            picked?.id === hit.id ? "bg-[#EEF1FF]" : ""
                          }`}
                          onClick={() => pickPlace(hit, true)}
                        >
                          <span className="font-medium text-[#080B3A]">
                            {hit.name}
                            {categoryLabel(hit.category) ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[#0400FF]">
                                {categoryLabel(hit.category)}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#6B7280]">
                            {hit.address}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {picked ? (
                  <p className="rounded-[10px] bg-[#F5F7FF] px-3 py-2 text-xs text-[#080B3A]">
                    {t("calendar.selected")}:{" "}
                    <span className="font-semibold">{picked.name}</span>
                  </p>
                ) : null}
                {note && !aiSuggestions.length ? (
                  <p className="text-xs text-[#6B7280]">{note}</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Label>{t("calendar.searchPlaces")}</Label>
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cafe, museum, park…"
                    autoFocus
                    autoComplete="off"
                  />
                  {searchResults.length ? (
                    <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-[10px] border border-[#E1E5F0] bg-white shadow-lg">
                      {searchResults.map((hit) => (
                        <li key={hit.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-[#DDE1FF]"
                            onClick={() => pickPlace(hit, false)}
                          >
                            <span className="font-medium text-[#080B3A]">
                              {hit.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-[#6B7280]">
                              {hit.address}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div>
                  <Label>{t("calendar.placeName")}</Label>
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (picked && e.target.value !== picked.name) {
                        setPicked(null);
                      }
                    }}
                    placeholder="Or type a custom stop name"
                  />
                </div>
                <div>
                  <Label>{t("calendar.note")}</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional detail"
                  />
                </div>
              </div>
            )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || (!name.trim() && !picked)}
                  onClick={() => void saveDraft()}
                >
                  {busy ? "…" : t("calendar.addStop")}
                </Button>
                <Button type="button" variant="ghost" onClick={closeComposer}>
                  Cancel
                </Button>
              </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {lockedFormOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[#080B3A]/35 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add meeting or transport"
          onClick={() => setLockedFormOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_16px_48px_rgba(8,11,58,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[#080B3A]">
              Locked stop · Day {lockedDayIndex + 1}
            </p>
            {days.length > 1 ? (
              <div className="mt-2">
                <Label>Day</Label>
                <select
                  value={lockedDayIndex}
                  onChange={(e) => setLockedDayIndex(Number(e.target.value))}
                  className="mt-1 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm"
                >
                  {days.map((d) => (
                    <option key={d.dayId} value={d.dayIndex}>
                      Day {d.dayIndex + 1}
                      {d.city ? ` · ${d.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="mt-3">
              <LockedTimedStopForm
                busy={busy}
                onSubmit={(input) => void saveLockedStop(input, lockedDayIndex)}
                onCancel={() => setLockedFormOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {hotelSuggestLeg != null && suggestLeg?.city && onUpdateLeg ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[#080B3A]/35 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Suggest a hotel brand"
          onClick={() => setHotelSuggestLeg(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_16px_48px_rgba(8,11,58,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#080B3A]">
                  Suggest a hotel brand
                </p>
                <p className="text-xs text-[#6B7280]">{suggestLeg.city}</p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[#6B7280]"
                onClick={() => setHotelSuggestLeg(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <HotelChoice
                city={suggestLeg.city}
                booked={false}
                minRating={hotelMinRating}
                place={hotelPlace}
                brand={hotelBrand}
                selectedName={suggestLeg.hotel ?? ""}
                onBooked={() => {
                  /* suggestions only */
                }}
                onMinRating={setHotelMinRating}
                onPlace={setHotelPlace}
                onBrand={setHotelBrand}
                onClear={() => {
                  onUpdateLeg(hotelSuggestLeg, {
                    hotel: "",
                    hotelAddress: undefined,
                    hotelLat: undefined,
                    hotelLng: undefined,
                    hotelPlaceId: undefined,
                  });
                }}
                onPick={(hotel) => {
                  onUpdateLeg(hotelSuggestLeg, {
                    hotel: hotel.name,
                    hotelAddress: hotel.location,
                    hotelBrand: hotelBrand.trim() || undefined,
                    hotelBooked: false,
                    hotelMinRating,
                    hotelPlace,
                    hotelLat: hotel.lat,
                    hotelLng: hotel.lng,
                    hotelPlaceId: hotel.id,
                  });
                  setHotelSuggestLeg(null);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
