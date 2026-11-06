"use client";

import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssistantPatch } from "@/lib/ai/patch";
import { shiftActivityStartTime } from "@/lib/ai/scheduler";
import {
  DEMO_CONTENT_VERSION,
  getDemoTripPayload,
  isDemoTripId,
} from "@/lib/demo/data";
import {
  loadOfflineTrip,
  saveOfflineDayGroups,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import { formatTripDate } from "@/lib/format-date";
import type { DayCityAssignment } from "@/lib/trips/legs";
import { deleteTrip } from "@/lib/trips/delete-trip";
import {
  formatIntercityModeLabel,
  intercityModeFromPlaceId,
  type IntercityMode,
} from "@/lib/trips/intercity-transit";
import { CityCard } from "./CityCard";
import { DistrictCard } from "./DistrictCard";
import { StopBlurb } from "./StopBlurb";
import { CityHotelField } from "./CityHotelField";
import { AddStopSearch, PlaceCard, type SelectedPlace } from "./PlaceCard";
import { PopularityBadge } from "./PopularityBadge";
import { TripMap, type MapPin } from "./TripMap";
import { AssistantPanel } from "./AssistantPanel";
import { BudgetPanel } from "./BudgetPanel";
import { TripIntelligence } from "./TripIntelligence";
import type { BudgetPlan } from "@/lib/trips/budget";
import { rememberAddedPlace, rememberRemovedPlace } from "@/lib/trips/place-feedback";
import type { ActivityRow, LegTransitMode, TripLeg } from "@/lib/types/trip";

const LEG_CARD_COLORS = [
  { border: "border-[#0400FF]/35", bg: "bg-[#F5F7FF]", tag: "bg-[#0400FF]" },
  { border: "border-[#0F766E]/35", bg: "bg-[#F0FDFA]", tag: "bg-[#0F766E]" },
  { border: "border-[#B45309]/35", bg: "bg-[#FFF7ED]", tag: "bg-[#B45309]" },
  { border: "border-[#6D28D9]/35", bg: "bg-[#F5F3FF]", tag: "bg-[#6D28D9]" },
];

const INTERCITY_MODE_OPTIONS: { value: LegTransitMode; label: string }[] = [
  { value: "auto", label: "Auto (planner picks)" },
  { value: "flight", label: "Flight" },
  { value: "major_train", label: "Major train (book)" },
  { value: "regional_rail", label: "Regional rail" },
  { value: "coach", label: "Coach / bus" },
  { value: "ferry", label: "Ferry / boat" },
  { value: "car", label: "Car / road" },
];

function transitModeFromActivity(activity: ActivityRow): IntercityMode | "flight_arrive" | null {
  if (activity.place_id?.startsWith("flight:arrive:")) return "flight_arrive";
  const fromId = intercityModeFromPlaceId(activity.place_id);
  if (fromId) return fromId;
  const n = activity.name.toLowerCase();
  if (n.startsWith("flight")) return "flight";
  if (n.startsWith("major train")) return "major_train";
  if (n.startsWith("regional rail")) return "regional_rail";
  if (n.startsWith("coach") || n.startsWith("bus")) return "coach";
  if (n.startsWith("ferry") || n.startsWith("boat")) return "ferry";
  if (n.startsWith("car /") || n.startsWith("car ·")) return "car";
  if (activity.place_id?.startsWith("transit:")) return "coach";
  return null;
}

function TransitModeChip({ mode }: { mode: IntercityMode | "flight_arrive" }) {
  const label =
    mode === "flight_arrive"
      ? "Arrival flight"
      : formatIntercityModeLabel(mode);
  const book =
    mode === "flight" || mode === "major_train" || mode === "ferry";
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#080B3A] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      {label}
      {book ? (
        <span className="rounded bg-[#C45F00] px-1 py-px text-[9px] normal-case tracking-normal">
          book
        </span>
      ) : null}
    </span>
  );
}

type DayGroup = {
  dayId: string;
  dayIndex: number;
  activities: ActivityRow[];
};

export function ItineraryEditor({
  tripId,
  destination,
  initialDays,
  initialActivities,
  isDemo = false,
  startDate,
  endDate,
  dayCities,
  initialLegs,
  tripTitle,
  interests = [],
  budgetPlan,
}: {
  tripId: string;
  destination: string;
  initialDays: { id: string; day_index: number }[];
  initialActivities: ActivityRow[];
  isDemo?: boolean;
  startDate?: string;
  endDate?: string;
  dayCities?: DayCityAssignment[];
  initialLegs?: TripLeg[];
  tripTitle?: string;
  interests?: string[];
  budgetPlan?: BudgetPlan;
}) {
  const [days, setDays] = useState<DayGroup[]>(() =>
    initialDays
      .sort((a, b) => a.day_index - b.day_index)
      .map((d) => ({
        dayId: d.id,
        dayIndex: d.day_index,
        activities: initialActivities
          .filter((a) => a.day_id === d.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      })),
  );
  const [hydratedOffline, setHydratedOffline] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });
  const [view, setView] = useState<"schedule" | "map" | "split">("split");
  const [selectedDay, setSelectedDay] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [legs, setLegs] = useState<TripLeg[]>(() => initialLegs ?? []);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<MapPin | null>(null);
  const [cityPins, setCityPins] = useState<MapPin[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function removeTrip() {
    const name = destination.replace(/\s*\(Demo\)\s*/i, "").split(",")[0];
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteTrip(tripId);
    if (!result.ok) {
      setDeleteError(result.error ?? "Could not delete this trip");
      setDeleting(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  // Prefer locally saved edits (works offline / after reload).
  // Demo trips ignore stale snapshots (e.g. old Paris data under demo-dubai).
  useEffect(() => {
    if (hydratedOffline) return;
    try {
      const snap = loadOfflineTrip(tripId);
      if (snap?.days?.length) {
        const demoOk =
          !isDemoTripId(tripId) ||
          (snap.contentVersion === DEMO_CONTENT_VERSION &&
            snap.trip.destination ===
              getDemoTripPayload(tripId).trip.destination);
        if (demoOk) {
          setDays(
            snap.days
              .slice()
              .sort((a, b) => a.day_index - b.day_index)
              .map((d) => ({
                dayId: d.id,
                dayIndex: d.day_index,
                activities: snap.activities
                  .filter((a) => a.day_id === d.id)
                  .sort((a, b) => a.sort_order - b.sort_order),
              })),
          );
          if (snap.legs?.length) setLegs(snap.legs);
          setOfflineSaved(true);
        } else if (isDemoTripId(tripId) && initialLegs?.length) {
          // Stale demo cache — use fresh legs from payload
          setLegs(initialLegs);
        }
      } else if (initialLegs?.length) {
        setLegs(initialLegs);
      }
    } catch {
      /* ignore */
    }
    setHydratedOffline(true);
  }, [tripId, hydratedOffline, initialLegs]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const flatActivities = useMemo(
    () => days.flatMap((d) => d.activities),
    [days],
  );

  const persist = useCallback(
    async (nextDays: DayGroup[]) => {
      setSaveState("saving");
      // Always persist locally first so edits survive offline
      try {
        saveOfflineDayGroups(tripId, destination, nextDays, {
          start_date: startDate,
          end_date: endDate,
        });
        setOfflineSaved(true);
      } catch {
        setSaveState("error");
        return;
      }

      if (isDemo || tripId.startsWith("offline-") || !navigator.onLine) {
        setSaveState("saved");
        return;
      }

      const payload = nextDays.flatMap((d) =>
        d.activities.map((a, sort_order) => ({
          id: a.id,
          day_id: d.dayId,
          sort_order,
          start_time: a.start_time,
          duration_minutes: a.duration_minutes,
          priority: a.priority,
          planning_note: a.planning_note,
          completed: a.completed,
          user_locked: true,
        })),
      );
      try {
        const res = await fetch(`/api/trips/${tripId}/activities`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activities: payload }),
        });
        setSaveState(res.ok ? "saved" : "saved"); // local copy already kept
      } catch {
        setSaveState("saved"); // offline — local copy is enough
      }
    },
    [tripId, isDemo, destination, startDate, endDate],
  );

  function updateLeg(index: number, patch: Partial<TripLeg>) {
    setLegs((prev) => {
      const next = prev.map((leg, i) =>
        i === index ? { ...leg, ...patch } : leg,
      );

      const relabelTransit = (
        groups: DayGroup[],
        from: TripLeg,
        to: TripLeg,
        modeOverride?: LegTransitMode,
      ) =>
        groups.map((d) => ({
          ...d,
          activities: d.activities.map((a) => {
            const mode = transitModeFromActivity(a);
            if (!mode || mode === "flight_arrive") return a;
            const labelMode =
              modeOverride && modeOverride !== "auto"
                ? modeOverride
                : mode;
            const fromHotel = from.hotel?.trim() || `${from.city} hotel`;
            const toHotel = to.hotel?.trim() || `${to.city} hotel`;
            const rest =
              a.planning_note
                ?.replace(/^city=\S+\s*·\s*/, "")
                .replace(/^Hotel-to-hotel:[^.]*\.\s*/, "") ?? "";
            return {
              ...a,
              name: `${formatIntercityModeLabel(labelMode)} · ${fromHotel} → ${toHotel}`,
              address: `${from.city} hotel → ${to.city} hotel`,
              planning_note: `city=${to.city} · From ${fromHotel} in ${from.city} to ${toHotel} in ${to.city}. ${rest}`,
              place_id:
                modeOverride && modeOverride !== "auto"
                  ? `transit:${modeOverride}:${from.city}:${to.city}`
                  : a.place_id,
            };
          }),
        }));

      // Hotel edits on either city — refresh the connecting transit card
      if (patch.hotel !== undefined || patch.transitFromPrevious !== undefined) {
        const pairIndex = index === 0 ? 1 : index;
        const from = next[pairIndex - 1];
        const to = next[pairIndex];
        if (from && to) {
          queueMicrotask(() => {
            setDays((groups) => {
              const copy = relabelTransit(
                groups,
                from,
                to,
                patch.transitFromPrevious,
              );
              void persist(copy);
              return copy;
            });
          });
        }
      }

      try {
        const snap = loadOfflineTrip(tripId);
        if (snap) saveOfflineTrip({ ...snap, legs: next });
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const applyAssistantPatch = useCallback(
    (patch: AssistantPatch) => {
      setDays((prev) => {
        let copy = prev.map((d) => ({
          ...d,
          activities: d.activities.map((a) => ({ ...a })),
        }));

        for (const op of patch.operations) {
          if (op.op === "delete") {
            copy = copy.map((d) => ({
              ...d,
              activities: d.activities.filter((a) => a.id !== op.activityId),
            }));
          } else if (op.op === "replace") {
            copy = copy.map((d) => ({
              ...d,
              activities: d.activities.map((a) =>
                a.id === op.activityId
                  ? {
                      ...a,
                      name: op.newName,
                      hours_verified: false,
                      planning_note:
                        op.planningNote ??
                        "Suggested by Trip Wizard — confirm details before you visit",
                      user_locked: true,
                    }
                  : a,
              ),
            }));
          } else if (op.op === "move") {
            let moved: ActivityRow | null = null;
            copy = copy.map((d) => {
              const idx = d.activities.findIndex((a) => a.id === op.activityId);
              if (idx < 0) return d;
              moved = d.activities[idx];
              return {
                ...d,
                activities: d.activities.filter((a) => a.id !== op.activityId),
              };
            });
            if (moved) {
              copy = copy.map((d) =>
                d.dayIndex === op.toDayIndex
                  ? {
                      ...d,
                      activities: [
                        ...d.activities,
                        { ...moved!, day_id: d.dayId, user_locked: true },
                      ],
                    }
                  : d,
              );
            }
          } else if (op.op === "shift_day") {
            copy = copy.map((d) =>
              d.dayIndex === op.dayIndex
                ? {
                    ...d,
                    activities: d.activities.map((a) => ({
                      ...a,
                      start_time: shiftActivityStartTime(
                        a.start_time,
                        op.shiftMinutes,
                      ),
                      planning_note: op.reason
                        ? `Adjusted for: ${op.reason}`
                        : a.planning_note,
                      user_locked: true,
                    })),
                  }
                : d,
            );
          } else if (op.op === "set_travel") {
            copy = copy.map((d) => ({
              ...d,
              activities: d.activities.map((a) =>
                a.id === op.activityId
                  ? {
                      ...a,
                      travel_minutes_from_prev: op.travelMinutesFromPrev,
                      end_time: op.endTime ?? a.end_time,
                      sort_order:
                        op.sortOrder != null ? op.sortOrder : a.sort_order,
                      user_locked: true,
                    }
                  : a,
              ),
            }));
          } else if (op.op === "update") {
            copy = copy.map((d) => ({
              ...d,
              activities: d.activities.map((a) =>
                a.id === op.activityId
                  ? {
                      ...a,
                      start_time: op.fields.startTime
                        ? `${op.fields.startTime}:00`.slice(0, 8)
                        : a.start_time,
                      duration_minutes:
                        op.fields.durationMinutes ?? a.duration_minutes,
                      priority: op.fields.priority ?? a.priority,
                      planning_note:
                        op.fields.planningNote ?? a.planning_note,
                      completed: op.fields.completed ?? a.completed,
                      name: op.fields.name ?? a.name,
                      user_locked: true,
                    }
                  : a,
              ),
            }));
          } else if (op.op === "insert") {
            const id =
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `ins-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const start =
              op.startTime.length === 5
                ? `${op.startTime}:00`
                : op.startTime;
            copy = copy.map((d) =>
              d.dayIndex === op.toDayIndex
                ? {
                    ...d,
                    activities: [
                      ...d.activities,
                      {
                        id,
                        day_id: d.dayId,
                        place_id: op.placeId ?? null,
                        name: op.name ?? "Suggested stop",
                        address: op.address ?? null,
                        lat: op.lat ?? null,
                        lng: op.lng ?? null,
                        start_time: start,
                        end_time: null,
                        duration_minutes: op.durationMinutes,
                        travel_minutes_from_prev: 0,
                        priority: op.priority,
                        planning_note:
                          op.planningNote ??
                          "Assistant suggestion — verify before visiting",
                        hours_verified: false,
                        opening_hours: null,
                        website_uri: null,
                        google_maps_uri: null,
                        photo_name: null,
                        popularity_label: op.popularityLabel ?? null,
                        popularity_sources: op.popularitySources ?? null,
                        popularity_attribution_urls: null,
                        schedule_warnings: null,
                        sort_order: d.activities.length,
                        user_locked: false,
                        completed: false,
                        source: op.recommended
                          ? "food_recommend"
                          : "assistant",
                      } satisfies ActivityRow,
                    ],
                  }
                : d,
            );
          }
        }

        void persist(copy);
        return copy;
      });
    },
    [persist],
  );

  function onDragEnd(event: DragEndEvent, dayIndex: number) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDays((prev) => {
      const copy = prev.map((d) => ({ ...d, activities: [...d.activities] }));
      const day = copy[dayIndex];
      const oldIndex = day.activities.findIndex((a) => a.id === active.id);
      const newIndex = day.activities.findIndex((a) => a.id === over.id);
      day.activities = arrayMove(day.activities, oldIndex, newIndex);
      void persist(copy);
      return copy;
    });
  }

  function updateActivity(
    dayIndex: number,
    activityId: string,
    patch: Partial<ActivityRow>,
  ) {
    setDays((prev) => {
      const copy = prev.map((d) => ({
        ...d,
        activities: d.activities.map((a) =>
          a.id === activityId ? { ...a, ...patch, user_locked: true } : a,
        ),
      }));
      void persist(copy);
      return copy;
    });
  }

  function moveToDay(fromDayIndex: number, activityId: string, toDayIndex: number) {
    setDays((prev) => {
      const copy = prev.map((d) => ({ ...d, activities: [...d.activities] }));
      const from = copy[fromDayIndex];
      const idx = from.activities.findIndex((a) => a.id === activityId);
      if (idx < 0) return prev;
      const [act] = from.activities.splice(idx, 1);
      copy[toDayIndex].activities.push({ ...act, day_id: copy[toDayIndex].dayId });
      void persist(copy);
      return copy;
    });
  }

  function addStop(dayIndex: number, place: SelectedPlace) {
    const id = `stop-${crypto.randomUUID()}`;
    setDays((prev) => {
      const copy = prev.map((d) => ({ ...d, activities: [...d.activities] }));
      const day = copy[dayIndex];
      if (!day) return prev;
      day.activities.push({
        id,
        day_id: day.dayId,
        name: place.name,
        place_id: null,
        address: place.address ?? null,
        lat: place.lat,
        lng: place.lng,
        start_time: "12:00:00",
        end_time: null,
        duration_minutes: 60,
        travel_minutes_from_prev: 0,
        priority: "preferred",
        planning_note: null,
        hours_verified: false,
        opening_hours: null,
        website_uri: null,
        google_maps_uri: null,
        photo_name: null,
        popularity_label: null,
        popularity_sources: null,
        popularity_attribution_urls: null,
        schedule_warnings: null,
        sort_order: day.activities.length,
        user_locked: true,
        completed: false,
        source: "user",
      });
      void persist(copy);
      return copy;
    });
    rememberAddedPlace(place.name);
    setSelectedPlace({ ...place, activityId: id, dayIndex });
    setSelectedDay(dayIndex);
  }

  function deleteActivity(dayIndex: number, activityId: string) {
    setDays((prev) => {
      const copy = prev.map((d, i) =>
        i === dayIndex
          ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
          : d,
      );
      const removed = prev[dayIndex]?.activities.find((activity) => activity.id === activityId);
      rememberRemovedPlace(removed?.place_id || removed?.name);
      void persist(copy);
      return copy;
    });
  }

  const destName = destination.replace(/\s*\(Demo\)\s*/i, "").trim();
  const areaKey = useMemo(() => {
    const names = [
      destName,
      ...(initialLegs ?? []).map((leg) => leg.city),
      ...(dayCities ?? []).map((day) => day.city),
    ];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const name of names) {
      const clean = name.replace(/\s*\(Demo\)\s*/i, "").split(",")[0]?.trim() ?? "";
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      unique.push(clean);
    }
    return unique.join("|");
  }, [destName, initialLegs, dayCities]);

  useEffect(() => {
    const names = areaKey.split("|").filter(Boolean);
    if (!names.length) {
      setCityPins([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      names.map(async (city) => {
        const res = await fetch(`/api/places/districts?city=${encodeURIComponent(city)}`);
        const data = (await res.json()) as {
          cities?: {
            id: number;
            name: string;
            lat: number;
            lng: number;
          }[];
        };
        return data.cities ?? [];
      }),
    )
      .then((groups) => {
        if (cancelled) return;
        const seen = new Set<number>();
        const pins: MapPin[] = [];
        for (const city of groups.flat()) {
          if (seen.has(city.id) || !Number.isFinite(city.lat) || !Number.isFinite(city.lng)) continue;
          seen.add(city.id);
          pins.push({
            lat: city.lat,
            lng: city.lng,
            label: city.name,
            order: 0,
            kind: "city",
          });
        }
        setCityPins(pins.slice(0, 10));
      })
      .catch(() => {
        if (!cancelled) setCityPins([]);
      });
    return () => {
      cancelled = true;
    };
  }, [areaKey]);

  return (
    <div className="space-y-5" data-tour="tour-itinerary">
      <section className="flex flex-col gap-3 rounded-[16px] border border-[#E1E5F0] bg-white px-5 py-5 shadow-[0_6px_18px_rgba(8,11,58,0.05)] sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#080B3A]">
            {destName}
            {tripTitle ? (
              <span className="ml-3 text-[20px] font-semibold text-[#0400FF]">
                {tripTitle}
              </span>
            ) : null}
            {startDate ? (
              <span className="ml-3 text-[16px] font-medium text-[#6B7280]">
                {formatTripDate(startDate, "short")}
                {endDate ? ` – ${formatTripDate(endDate, "long")}` : ""}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {days.length} days · {flatActivities.length} activities ·{" "}
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? offlineSaved
                  ? "Saved on this device"
                  : "Saved"
                : saveState === "error"
                  ? "Couldn’t save"
                  : offlineSaved
                    ? "Saved on this device"
                    : "Up to date"}
          </p>
          {deleteError ? (
            <p className="mt-2 text-sm text-[#B91C1C]">{deleteError}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void removeTrip()}
            disabled={deleting}
            className="rounded-[10px] px-3 py-1.5 text-sm font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete trip"}
          </button>
        <div className="flex rounded-[12px] border border-[#E1E5F0] bg-[#F5F7FF] p-1 text-sm">
          {(["schedule", "map", "split"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-[10px] px-3.5 py-1.5 capitalize ${
                view === v
                  ? "bg-[#0400FF] text-white"
                  : "text-[#6B7280] hover:text-[#080B3A]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        </div>
      </section>
      <BudgetPanel
        plan={budgetPlan}
        stops={(days[selectedDay]?.activities ?? []).map((activity) => ({
          id: activity.id,
          name: activity.name,
        }))}
      />
      <TripIntelligence
        activities={days[selectedDay]?.activities ?? []}
        onApplyStart={(activityId, start) =>
          updateActivity(selectedDay, activityId, { start_time: start })
        }
      />

      <div
        className={`grid gap-4 ${view === "split" ? "lg:grid-cols-2 lg:items-start" : "grid-cols-1"}`}
      >
        {(view === "schedule" || view === "split") && (
          <div className="min-w-0 space-y-2">
            {legs.length > 0 ? (
              <section className="space-y-2 rounded-[14px] border border-[#E1E5F0] bg-white p-3 shadow-[0_2px_12px_rgba(8,11,58,0.04)]">
                <div>
                  <h2 className="text-sm font-semibold text-[#080B3A]">
                    Cities & hotels
                  </h2>
                  <p className="text-[11px] text-[#6B7280]">
                    Each card is a different city. Between cities, set how you
                    travel hotel → hotel.
                  </p>
                </div>
                {legs.map((leg, i) => {
                  const palette = LEG_CARD_COLORS[i % LEG_CARD_COLORS.length];
                  const prev = i > 0 ? legs[i - 1] : null;
                  const fromLabel =
                    prev?.hotel?.trim() ||
                    (prev ? `${prev.city} hotel` : "");
                  const toLabel =
                    leg.hotel?.trim() || `${leg.city} hotel`;
                  return (
                    <div key={`${leg.city}-${i}`} className="space-y-2">
                      {prev ? (
                        <div className="rounded-[12px] border border-dashed border-[#C5CAD8] bg-[#FAFBFF] px-3 py-2.5">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                            Place to place
                          </p>
                          <p className="mb-1 text-sm font-medium text-[#080B3A]">
                            {fromLabel}
                            <span className="mx-1.5 text-[#0400FF]">→</span>
                            {toLabel}
                          </p>
                          <p className="mb-2 text-[11px] text-[#6B7280]">
                            {prev.city} → {leg.city}
                          </p>
                          <label className="block text-[11px] font-medium text-[#080B3A]">
                            Mode of transportation
                            <select
                              className="mt-1 w-full rounded-lg border border-[#D1D7E5] bg-white px-2.5 py-1.5 text-sm"
                              value={leg.transitFromPrevious || "auto"}
                              onChange={(e) =>
                                updateLeg(i, {
                                  transitFromPrevious: e.target
                                    .value as LegTransitMode,
                                })
                              }
                            >
                              {INTERCITY_MODE_OPTIONS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      <div
                        className={`rounded-[12px] border-2 ${palette.border} ${palette.bg} p-3`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-bold text-white ${palette.tag}`}
                          >
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[#080B3A]">
                              {leg.city}
                              <span className="ml-1.5 font-normal text-[#6B7280]">
                                · {leg.days}d
                              </span>
                            </p>
                            <p className="text-[11px] text-[#6B7280]">
                              Separate city stay
                            </p>
                          </div>
                        </div>
                        <label className="block text-[11px] font-medium text-[#080B3A]">
                          Hotel in {leg.city}
                          <CityHotelField
                            city={leg.city}
                            value={leg.hotel ?? ""}
                            lat={leg.lat}
                            lng={leg.lng}
                            onChange={(next) => updateLeg(i, next)}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : null}
            {selectedCity ? (
              <CityCard name={selectedCity} onClose={() => setSelectedCity(null)} />
            ) : null}
            {days.map((day, dayIndex) => {
              const isOpen = Boolean(expanded[dayIndex]);
              return (
              <section
                key={day.dayId}
                className={`overflow-hidden rounded-[12px] border bg-white shadow-[0_2px_12px_rgba(8,11,58,0.04)] ${
                  selectedDay === dayIndex
                    ? "border-[#0400FF]/40"
                    : "border-[#E1E5F0]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
                  <span className="text-[16px] font-semibold text-[#080B3A]">
                    <button
                      type="button"
                      className="font-semibold"
                      onClick={() => {
                        setSelectedDay(dayIndex);
                        setExpanded((e) => ({
                          [dayIndex]: !e[dayIndex],
                        }));
                      }}
                    >
                      Day {day.dayIndex + 1}
                    </button>
                    {dayCities?.[day.dayIndex] ? (
                      <button
                        type="button"
                        className="ml-2 font-normal text-[#0400FF]"
                        onClick={() => setSelectedCity(dayCities[day.dayIndex].city)}
                      >
                        · {dayCities[day.dayIndex].city}
                        {dayCities[day.dayIndex].isArrivalTransitDay ? (
                          <>
                            {" "}
                            <span className="text-[#6B7280]">
                              · arrive from{" "}
                              {dayCities[day.dayIndex].previousCity}
                              {(() => {
                                const legIdx = legs.findIndex(
                                  (l) =>
                                    l.city === dayCities[day.dayIndex].city,
                                );
                                const to = legIdx >= 0 ? legs[legIdx] : null;
                                const from =
                                  legIdx > 0 ? legs[legIdx - 1] : null;
                                if (!from?.hotel && !to?.hotel) return null;
                                return (
                                  <>
                                    {" "}
                                    (
                                    {from?.hotel?.trim() ||
                                      `${from?.city ?? "prev"} hotel`}
                                    {" → "}
                                    {to?.hotel?.trim() ||
                                      `${to?.city ?? "next"} hotel`}
                                    )
                                  </>
                                );
                              })()}
                            </span>
                          </>
                        ) : null}
                      </button>
                    ) : null}
                    <span className="ml-2 font-normal text-[#6B7280]">
                      · {day.activities.length} stops
                    </span>
                  </span>
                  <button
                    type="button"
                    className="rounded-full bg-[#F5F7FF] px-2.5 py-1 text-[11px] font-semibold text-[#0400FF]"
                    onClick={() => {
                      setSelectedDay(dayIndex);
                      setExpanded((e) => ({
                        [dayIndex]: !e[dayIndex],
                      }));
                    }}
                  >
                    {isOpen ? "Hide" : "Show"}
                  </button>
                </div>
                {isOpen ? (
                  <div className="border-t border-[#E1E5F0] bg-[#FAFBFF] px-3 pb-3">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => onDragEnd(e, dayIndex)}
                    >
                      <SortableContext
                        items={day.activities.map((a) => a.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="space-y-3 pt-3">
                          {day.activities.map((act, actIndex) => (
                            <Fragment key={act.id}>
                              {actIndex > 0 ? (
                                <li className="list-none">
                                  <TransitBlock
                                    minutes={
                                      (act.travel_minutes_from_prev ?? 0) > 0
                                        ? act.travel_minutes_from_prev
                                        : null
                                    }
                                  />
                                </li>
                              ) : null}
                              <SortableActivity
                                activity={act}
                                dayCount={days.length}
                                dayIndex={dayIndex}
                                onMoveDay={(to) =>
                                  moveToDay(dayIndex, act.id, to)
                                }
                                onUpdate={(patch) =>
                                  updateActivity(dayIndex, act.id, patch)
                                }
                                onDelete={() =>
                                  deleteActivity(dayIndex, act.id)
                                }
                              />
                            </Fragment>
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                    <AddStopSearch
                      near={(() => {
                        const anchored = day.activities.find(
                          (a) => a.lat != null && a.lng != null,
                        );
                        return anchored
                          ? { lat: anchored.lat!, lng: anchored.lng! }
                          : null;
                      })()}
                      onPick={(hit) => {
                        setSelectedDay(dayIndex);
                        setSelectedPlace({
                          name: hit.name,
                          lat: hit.lat,
                          lng: hit.lng,
                          address: hit.address,
                          dayIndex,
                        });
                        setView((current) =>
                          current === "schedule" ? "split" : current,
                        );
                      }}
                    />
                    {!isDemo ? (
                      <RegenerateDayButton
                        tripId={tripId}
                        dayIndex={day.dayIndex}
                      />
                    ) : (
                      <p className="mt-2 border-t border-[#E1E5F0] pt-2 text-[11px] text-[#6B7280]">
                        Regenerating a day is available once the trip is saved to
                        your account.
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            );
            })}
          </div>
        )}

        {(view === "map" || view === "split") && (
          <div
            className={
              view === "split"
                ? "lg:sticky lg:top-[4.5rem] lg:self-start lg:h-[calc(100vh-5.5rem)]"
                : "min-h-[320px] lg:min-h-[480px]"
            }
          >
            <div className="h-full min-h-[280px] overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white lg:min-h-0">
              <TripMap
                pins={cityPins}
                connect={false}
                onSelectPin={(pin) => {
                  setSelectedPlace(null);
                  setSelectedDistrict(pin);
                }}
                overlay={
                  selectedDistrict ? (
                    <DistrictCard
                      name={selectedDistrict.label}
                      lat={selectedDistrict.lat}
                      lng={selectedDistrict.lng}
                      interests={interests}
                      onClose={() => setSelectedDistrict(null)}
                    />
                  ) : selectedPlace ? (
                    <PlaceCard
                      place={selectedPlace}
                      onClose={() => setSelectedPlace(null)}
                      onAdd={
                        selectedPlace.activityId
                          ? undefined
                          : () =>
                              addStop(
                                selectedPlace.dayIndex ?? selectedDay,
                                selectedPlace,
                              )
                      }
                    />
                  ) : null
                }
              />
            </div>
          </div>
        )}
      </div>

      <AssistantPanel
        tripId={tripId}
        isDemo={isDemo}
        onDemoApply={isDemo ? applyAssistantPatch : undefined}
      />
    </div>
  );
}

function clockMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function displayEnd(activity: ActivityRow): string | null {
  const start = clockMinutes(activity.start_time);
  const end = clockMinutes(activity.end_time);
  if (start != null && end != null && end > start) {
    return activity.end_time!.slice(0, 5);
  }
  if (start == null) return null;
  const total = start + (activity.duration_minutes ?? 0);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function TransitBlock({ minutes }: { minutes: number | null }) {
  return (
    <div
      className="flex items-center gap-2 px-1 py-0.5"
      aria-label={
        minutes != null
          ? `${minutes} minutes travel between stops`
          : "Travel between stops"
      }
    >
      <div className="h-px flex-1 border-t border-dashed border-[#C5CAE5]" />
      <p className="shrink-0 text-[10px] font-medium text-[#6B7280]">
        {minutes != null ? `${minutes} min` : "Between stops"}
      </p>
      <div className="h-px flex-1 border-t border-dashed border-[#C5CAE5]" />
    </div>
  );
}

function SortableActivity({
  activity,
  dayIndex,
  dayCount,
  onMoveDay,
  onUpdate,
  onDelete,
}: {
  activity: ActivityRow;
  dayIndex: number;
  dayCount: number;
  onMoveDay: (toDayIndex: number) => void;
  onUpdate: (patch: Partial<ActivityRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const endsAt = displayEnd(activity);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden rounded-[16px] border bg-white shadow-[0_6px_18px_rgba(8,11,58,0.05)] ${
        activity.completed ? "border-[#E1E5F0] opacity-70" : "border-[#E1E5F0]"
      }`}
    >
      <div className="flex">
        <div className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 bg-[#F5F7FF] px-2 py-3 text-center">
          <button
            type="button"
            className="cursor-grab text-[10px] tracking-widest text-[#9299B5]"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </button>
          <span className="text-[15px] font-semibold leading-none text-[#080B3A]">
            {activity.start_time?.slice(0, 5) || "—"}
          </span>
          <span className="text-[10px] text-[#6B7280]">
            {activity.duration_minutes ?? 60} min
          </span>
        </div>
        <div className="min-w-0 flex-1 px-3.5 py-3">
          {(() => {
            const transitMode = transitModeFromActivity(activity);
            return transitMode ? (
              <div className="mb-1.5">
                <TransitModeChip mode={transitMode} />
              </div>
            ) : null;
          })()}
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-[15px] font-semibold leading-snug text-[#080B3A] ${
                activity.completed ? "line-through" : ""
              }`}
            >
              {activity.name}
            </p>
            {activity.priority && activity.priority !== "optional" ? (
              <span className="shrink-0 rounded-full bg-[#DDE1FF] px-2 py-0.5 text-[10px] font-semibold capitalize text-[#0400FF]">
                {activity.priority.replace("_", " ")}
              </span>
            ) : null}
          </div>
          {activity.address ? (
            <p className="mt-1 text-xs leading-snug text-[#6B7280]">{activity.address}</p>
          ) : null}
          {endsAt ? (
            <p className="mt-1 text-[11px] text-[#6B7280]">Until {endsAt}</p>
          ) : null}
          {activity.place_id?.startsWith("transit:") ||
          activity.place_id?.startsWith("flight:") ? null : activity.hours_verified &&
            typeof activity.opening_hours === "string" ? (
            <p className="mt-1 text-[11px] font-medium text-[#080B3A]">
              Open {activity.opening_hours}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-[#6B7280]">Hours unknown</p>
          )}
          {activity.schedule_warnings?.slice(0, 1).map((w) => (
            <p key={w} className="mt-1 text-[11px] text-[#B45309]">
              {w}
            </p>
          ))}
          <PopularityBadge
            label={activity.popularity_label}
            sources={activity.popularity_sources ?? undefined}
            attributionUrls={activity.popularity_attribution_urls ?? undefined}
          />
          <StopBlurb
            name={activity.name}
            address={activity.address}
            lat={activity.lat}
            lng={activity.lng}
            planningNote={activity.planning_note}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="time"
              aria-label="Start time"
              className="rounded-[8px] border border-[#D1D7E5] bg-white px-2 py-1 text-xs"
              value={activity.start_time?.slice(0, 5) ?? ""}
              onChange={(e) => onUpdate({ start_time: `${e.target.value}:00` })}
            />
            <input
              type="number"
              min={15}
              aria-label="Duration in minutes"
              className="w-16 rounded-[8px] border border-[#D1D7E5] bg-white px-2 py-1 text-xs"
              value={activity.duration_minutes ?? 60}
              onChange={(e) =>
                onUpdate({ duration_minutes: Number(e.target.value) })
              }
            />
            <button
              type="button"
              className="rounded-full bg-[#F5F7FF] px-2.5 py-1 text-[11px] font-semibold text-[#0400FF]"
              onClick={() => onUpdate({ completed: !activity.completed })}
            >
              {activity.completed ? "Undo" : "Done"}
            </button>
            <button
              type="button"
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#DC2626]"
              onClick={onDelete}
            >
              Remove
            </button>
            {dayCount > 1 ? (
              <select
                aria-label="Move to day"
                className="rounded-[8px] border border-[#D1D7E5] bg-white px-2 py-1 text-[11px]"
                value={dayIndex}
                onChange={(e) => onMoveDay(Number(e.target.value))}
              >
                {Array.from({ length: dayCount }, (_, i) => (
                  <option key={i} value={i}>
                    Day {i + 1}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function RegenerateDayButton({
  tripId,
  dayIndex,
}: {
  tripId: string;
  dayIndex: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  async function regen(mode?: string) {
    setMsg("Regenerating…");
    const res = await fetch(`/api/trips/${tripId}/regenerate-day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayIndex, mode }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Preview ready — reload to apply saved changes." : data.error);
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E1E5F0] pt-3">
      <button
        type="button"
        className="text-xs text-[#0400FF]"
        onClick={() => regen()}
      >
        Regenerate day
      </button>
      <button type="button" className="text-xs text-[#0400FF]" onClick={() => regen("relaxed")}>
        More relaxed
      </button>
      <button type="button" className="text-xs text-[#0400FF]" onClick={() => regen("optimize_geo")}>
        Optimize route
      </button>
      {msg ? <p className="w-full text-xs text-[#6B7280]">{msg}</p> : null}
    </div>
  );
}
