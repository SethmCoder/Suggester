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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssistantPatch } from "@/lib/ai/patch";
import { shiftActivityStartTime } from "@/lib/ai/scheduler";
import type { GeneratedDay } from "@/lib/ai/generate-itinerary";
import {
  DEMO_CONTENT_VERSION,
  getDemoTripPayload,
  isDemoTripId,
} from "@/lib/demo/data";
import {
  loadOfflineTrip,
  saveOfflineDayGroups,
  saveOfflineExpenses,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import { offlineSnapshotFromGenerated } from "@/lib/trips/offline-from-generated";
import { formatTripDate } from "@/lib/format-date";
import type { DayCityAssignment } from "@/lib/trips/legs";
import { deleteTrip } from "@/lib/trips/delete-trip";
import {
  formatIntercityModeLabel,
  intercityModeFromPlaceId,
  type IntercityMode,
} from "@/lib/trips/intercity-transit";
import { CityCard } from "./CityCard";
import { DayWeatherBadge } from "./DayWeather";
import { DistrictCard } from "./DistrictCard";
import { StopBlurb } from "./StopBlurb";
import { AddStopSearch, PlaceCard, type SelectedPlace } from "./PlaceCard";
import { PopularityBadge } from "./PopularityBadge";
import { TripMap, type MapPin } from "./TripMap";
import { AssistantPanel } from "./AssistantPanel";
import { BudgetPanel } from "./BudgetPanel";
import { TripIntelligence } from "./TripIntelligence";
import {
  WeekCalendarView,
  type CalendarNewStop,
} from "./WeekCalendarView";
import type { BudgetPlan } from "@/lib/trips/budget";
import {
  normalizeExpenses,
  type TripExpense,
} from "@/lib/trips/expenses";
import { rememberAddedPlace, rememberRemovedPlace } from "@/lib/trips/place-feedback";
import type { ActivityRow, LegTransitMode, TripLeg } from "@/lib/types/trip";
import {
  reindexByChronology,
  sortActivitiesChronologically,
} from "@/lib/trips/activity-order";
import { nightsBetween, nightsLabel } from "@/lib/trips/dates";
import { TripPlanSidebar } from "@/components/trips/TripPlanSidebar";
import { TripBookingsPanel } from "@/components/trips/TripBookingsPanel";
import {
  stopColorForIndex,
  stopColorForKey,
} from "@/lib/trips/stop-colors";
import { useLanguage } from "@/components/i18n/LanguageProvider";

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
  initialExpenses = [],
  initialStatus,
  pendingBuild,
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
  initialExpenses?: TripExpense[];
  initialStatus?: string | null;
  pendingBuild?: Record<string, unknown> | null;
}) {
  const { t } = useLanguage();
  const [days, setDays] = useState<DayGroup[]>(() =>
    initialDays
      .sort((a, b) => a.day_index - b.day_index)
      .map((d) => ({
        dayId: d.id,
        dayIndex: d.day_index,
        activities: sortActivitiesChronologically(
          initialActivities.filter((a) => a.day_id === d.id),
        ),
      })),
  );
  const [hydratedOffline, setHydratedOffline] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(
      initialDays.map((d) => [d.day_index, d.day_index === 0] as const),
    ),
  );
  const [view, setView] = useState<"schedule" | "map" | "split" | "calendar">(
    "schedule",
  );
  const [selectedDay, setSelectedDay] = useState(0);

  // Keep day-by-day open by default as days hydrate or grow.
  useEffect(() => {
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const day of days) {
        if (next[day.dayIndex] == null) {
          next[day.dayIndex] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [days]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [legs, setLegs] = useState<TripLeg[]>(() => initialLegs ?? []);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<MapPin | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expenses, setExpenses] = useState<TripExpense[]>(() =>
    normalizeExpenses(initialExpenses),
  );
  const [expensesHydrated, setExpensesHydrated] = useState(false);
  const [buildStatus, setBuildStatus] = useState<
    "idle" | "generating" | "ready" | "failed"
  >(() => {
    if (pendingBuild) return "generating";
    if (initialStatus === "generating") return "generating";
    if (initialStatus === "failed") return "failed";
    return "idle";
  });
  const [buildError, setBuildError] = useState<string | null>(null);
  const buildStarted = useRef(false);

  function applyFetchedPlan(input: {
    days: { id: string; day_index: number }[];
    activities: ActivityRow[];
  }) {
    const sortedDays = [...input.days].sort((a, b) => a.day_index - b.day_index);
    setDays(
      sortedDays.map((d) => ({
        dayId: d.id,
        dayIndex: d.day_index,
        activities: sortActivitiesChronologically(
          input.activities.filter((a) => a.day_id === d.id),
        ),
      })),
    );
  }

  // Cloud: ensure /build is running, then poll until days fill in.
  useEffect(() => {
    if (isDemoTripId(tripId) || tripId.startsWith("offline-")) return;
    if (buildStatus !== "generating") return;

    let cancelled = false;
    if (!buildStarted.current) {
      buildStarted.current = true;
      void fetch(`/api/trips/${tripId}/build`, {
        method: "POST",
        credentials: "same-origin",
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            setBuildStatus("failed");
            setBuildError(
              typeof data.error === "string"
                ? data.error
                : "Could not build this itinerary",
            );
          }
        })
        .catch(() => {
          /* polling below still observes status */
        });
    }

    const poll = window.setInterval(() => {
      void fetch(`/api/trips/${tripId}`, { credentials: "same-origin" })
        .then(async (res) => {
          if (!res.ok || cancelled) return;
          const data = await res.json();
          const status = data?.trip?.status as string | undefined;
          const nextDays = (data?.days ?? []) as {
            id: string;
            day_index: number;
          }[];
          const nextActs = (data?.activities ?? []) as ActivityRow[];
          if (nextDays.length) {
            applyFetchedPlan({ days: nextDays, activities: nextActs });
          }
          if (status === "ready" || nextActs.length > 0) {
            setBuildStatus("ready");
            setBuildError(null);
            window.clearInterval(poll);
          } else if (status === "failed") {
            setBuildStatus("failed");
            setBuildError("Could not build this itinerary");
            window.clearInterval(poll);
          }
        })
        .catch(() => null);
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [tripId, buildStatus]);

  // Offline / demo shell: run demo-create in the background, then fill the page.
  useEffect(() => {
    if (!pendingBuild || !tripId.startsWith("offline-")) return;
    if (buildStarted.current) return;
    buildStarted.current = true;
    let cancelled = false;
    setBuildStatus("generating");
    void (async () => {
      try {
        const res = await fetch("/api/trips/demo-create", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingBuild),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !Array.isArray(data.days)) {
          setBuildStatus("failed");
          setBuildError(
            typeof data.error === "string"
              ? data.error
              : "Could not generate this trip",
          );
          return;
        }
        const snap = offlineSnapshotFromGenerated({
          tripId,
          destination: data.destination || destination,
          startDate: startDate || new Date().toISOString().slice(0, 10),
          endDate: endDate || startDate || new Date().toISOString().slice(0, 10),
          days: data.days as GeneratedDay[],
          legs: (data.legs as TripLeg[] | undefined) ?? initialLegs,
          title: tripTitle,
          budget: budgetPlan,
        });
        saveOfflineTrip({ ...snap, pendingBuild: undefined });
        applyFetchedPlan({
          days: snap.days,
          activities: snap.activities,
        });
        if (snap.legs?.length) setLegs(snap.legs);
        setBuildStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setBuildStatus("failed");
        setBuildError(
          e instanceof Error ? e.message : "Could not generate this trip",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    pendingBuild,
    tripId,
    destination,
    startDate,
    endDate,
    initialLegs,
    tripTitle,
    budgetPlan,
  ]);
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
                activities: sortActivitiesChronologically(
                  snap.activities.filter((a) => a.day_id === d.id),
                ),
              })),
          );
          if (snap.legs?.length) setLegs(snap.legs);
          if (snap.expenses?.length) {
            setExpenses(normalizeExpenses(snap.expenses));
          }
          setOfflineSaved(true);
        } else if (isDemoTripId(tripId) && initialLegs?.length) {
          // Stale demo cache — use fresh legs from payload
          setLegs(initialLegs);
        }
      } else if (initialLegs?.length) {
        setLegs(initialLegs);
      }
      if (!expensesHydrated) {
        const localExpenses = loadOfflineTrip(tripId)?.expenses;
        if (localExpenses?.length) {
          setExpenses(normalizeExpenses(localExpenses));
        }
        setExpensesHydrated(true);
      }
    } catch {
      /* ignore */
    }
    setHydratedOffline(true);
  }, [tripId, hydratedOffline, initialLegs, expensesHydrated]);

  function persistExpenses(next: TripExpense[]) {
    setExpenses(next);
    try {
      saveOfflineExpenses(tripId, next);
      // Ensure a snapshot exists for cloud trips that never edited the schedule.
      const snap = loadOfflineTrip(tripId);
      if (!snap) {
        saveOfflineTrip({
          trip: {
            id: tripId,
            destination,
            start_date: startDate ?? "",
            end_date: endDate ?? "",
            cover_image_url: null,
            created_at: new Date().toISOString(),
            day_count: days.length,
            title: tripTitle,
          },
          days: days.map((d) => ({ id: d.dayId, day_index: d.dayIndex })),
          activities: days.flatMap((d) => d.activities),
          updatedAt: new Date().toISOString(),
          legs,
          budget: budgetPlan
            ? {
                total: budgetPlan.total,
                currency: budgetPlan.currency,
                allocation: budgetPlan.allocation,
                restaurantStyle: budgetPlan.restaurantStyle,
              }
            : undefined,
          expenses: next,
        });
      }
    } catch {
      /* localStorage may be unavailable */
    }
    if (isDemo || tripId.startsWith("offline-") || !navigator.onLine) return;
    void fetch(`/api/trips/${tripId}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          expenses: next,
          ...(budgetPlan?.total != null ? { budget: budgetPlan.total } : {}),
          ...(budgetPlan?.currency ? { currency: budgetPlan.currency } : {}),
        },
      }),
    }).catch(() => {
      /* offline ok */
    });
  }

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
        reindexByChronology(d.activities).map((a) => ({
          id: a.id,
          day_id: d.dayId,
          sort_order: a.sort_order,
          start_time: a.start_time,
          duration_minutes: a.duration_minutes,
          priority: a.priority,
          planning_note: a.planning_note,
          completed: a.completed,
          user_locked: true,
          name: a.name,
          address: a.address,
          lat: a.lat,
          lng: a.lng,
          place_id: a.place_id,
          source: a.source,
          upsert: a.source === "user" || a.id.startsWith("stop-"),
        })),
      );
      try {
        const res = await fetch(`/api/trips/${tripId}/activities`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activities: payload }),
        });
        setSaveState(res.ok ? "saved" : "error");
        if (!res.ok) setOfflineSaved(true);
      } catch {
        // Local copy kept — surface that cloud sync did not finish.
        setSaveState("error");
        setOfflineSaved(true);
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
      if (!isDemo && !tripId.startsWith("offline-") && navigator.onLine) {
        // Only patch legs/destinations — never overwrite intensity/transport.
        void fetch(`/api/trips/${tripId}/preferences`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: {
              destinations: next.map((l) => ({
                name: l.city,
                nights: l.nights ?? Math.max(0, l.days - 1),
                country: l.country,
              })),
              legs: next,
            },
          }),
        }).catch(() => {
          /* offline ok */
        });
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
      const copy = prev.map((d, i) => {
        const activities = d.activities.map((a) =>
          a.id === activityId ? { ...a, ...patch, user_locked: true } : a,
        );
        return {
          ...d,
          activities:
            i === dayIndex && ("start_time" in patch || "sort_order" in patch)
              ? reindexByChronology(activities)
              : activities,
        };
      });
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

  function addTimedStop(stop: CalendarNewStop) {
    const id = `stop-${crypto.randomUUID()}`;
    setDays((prev) => {
      const copy = prev.map((d) => ({ ...d, activities: [...d.activities] }));
      const day = copy[stop.dayIndex];
      if (!day) return prev;
      const activities = [
        ...day.activities,
        {
          id,
          day_id: day.dayId,
          name: stop.name,
          place_id: null,
          address: stop.address ?? null,
          lat: stop.lat ?? null,
          lng: stop.lng ?? null,
          start_time: stop.startTime,
          end_time: null,
          duration_minutes: stop.durationMinutes,
          travel_minutes_from_prev: 0,
          priority: "preferred" as const,
          planning_note: stop.note ?? null,
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
          source: stop.useAi ? "ai" : "user",
        },
      ];
      copy[stop.dayIndex] = {
        ...day,
        activities: reindexByChronology(activities),
      };
      void persist(copy);
      return copy;
    });
    rememberAddedPlace(stop.name);
    setSelectedDay(stop.dayIndex);
    setExpanded((e) => ({ ...e, [stop.dayIndex]: true }));
  }

  function deleteActivity(dayIndex: number, activityId: string) {
    const removed = days[dayIndex]?.activities.find(
      (activity) => activity.id === activityId,
    );
    if (
      !window.confirm(
        `Remove “${removed?.name ?? "this stop"}” from the itinerary? Saved places elsewhere are kept.`,
      )
    ) {
      return;
    }
    setDays((prev) => {
      const copy = prev.map((d, i) =>
        i === dayIndex
          ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
          : d,
      );
      rememberRemovedPlace(removed?.place_id || removed?.name);
      void persist(copy);
      return copy;
    });
  }

  const destName = destination.replace(/\s*\(Demo\)\s*/i, "").trim();
  const cityLegend = useMemo(() => {
    const seen = new Set<string>();
    const list: { city: string; color: string }[] = [];
    for (const day of days) {
      const city =
        dayCities?.[day.dayIndex]?.city ||
        legs.find((leg) => leg.city)?.city ||
        destName;
      const key = city.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({ city, color: stopColorForKey(city).solid });
    }
    if (!list.length && destName) {
      list.push({ city: destName, color: stopColorForKey(destName).solid });
    }
    return list;
  }, [days, dayCities, legs, destName]);

  const stopPins = useMemo(() => {
    const pins: MapPin[] = [];
    let order = 1;
    for (const day of days) {
      const city = dayCities?.[day.dayIndex]?.city;
      const color = city
        ? stopColorForKey(city).solid
        : stopColorForIndex(day.dayIndex).solid;
      for (const activity of day.activities) {
        if (
          activity.place_id?.startsWith("transit:") ||
          activity.place_id?.startsWith("flight:")
        ) {
          continue;
        }
        if (
          !Number.isFinite(activity.lat) ||
          !Number.isFinite(activity.lng) ||
          activity.lat == null ||
          activity.lng == null
        ) {
          continue;
        }
        pins.push({
          lat: activity.lat,
          lng: activity.lng,
          label: activity.name,
          order: order++,
          kind: "stop",
          activityId: activity.id,
          address: activity.address,
          color,
        });
      }
    }
    return pins;
  }, [days, dayCities]);

  const tripNights =
    startDate && endDate
      ? (() => {
          try {
            return nightsBetween(startDate, endDate);
          } catch {
            return 0;
          }
        })()
      : 0;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start" data-tour="tour-itinerary">
      <TripPlanSidebar
        tripId={tripId}
        destination={destName}
        startDate={startDate}
        endDate={endDate}
        cities={legs.map((l) => l.city).filter(Boolean)}
      />
      <div className="min-w-0 flex-1 space-y-5">
      <section id="itinerary" className="flex flex-col gap-3 rounded-[16px] border border-[#E1E5F0] bg-white px-5 py-5 shadow-[0_6px_18px_rgba(8,11,58,0.05)] sm:flex-row sm:items-end sm:justify-between sm:px-7">
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
            {tripNights > 0 ? `${nightsLabel(tripNights)} · ` : ""}
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
            {deleting ? "…" : t("itinerary.delete")}
          </button>
        <div className="flex flex-wrap rounded-[12px] border border-[#E1E5F0] bg-[#F5F7FF] p-1 text-sm">
          {(
            [
              { id: "schedule", labelKey: "itinerary.days" },
              { id: "calendar", labelKey: "itinerary.calendar" },
              { id: "map", labelKey: "itinerary.map" },
              { id: "split", labelKey: "itinerary.split" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`rounded-[10px] px-3.5 py-1.5 ${
                view === v.id
                  ? "bg-[#0400FF] text-white"
                  : "text-[#6B7280] hover:text-[#080B3A]"
              }`}
            >
              {t(v.labelKey)}
            </button>
          ))}
        </div>
        </div>
      </section>
      {buildStatus === "generating" ? (
        <div className="rounded-[14px] border border-[#DDE1FF] bg-[#F5F7FF] px-4 py-3 text-sm text-[#080B3A]">
          <p className="font-semibold">{t("itinerary.building")}</p>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            {t("itinerary.buildingHint")}
          </p>
        </div>
      ) : null}
      {buildStatus === "failed" ? (
        <div className="rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          <p className="font-semibold">{t("itinerary.buildFailed")}</p>
          <p className="mt-0.5 text-xs">
            {buildError || t("itinerary.buildFailed")}
          </p>
          {!tripId.startsWith("offline-") && !isDemoTripId(tripId) ? (
            <button
              type="button"
              className="mt-2 text-xs font-semibold underline"
              onClick={() => {
                buildStarted.current = false;
                setBuildError(null);
                setBuildStatus("generating");
              }}
            >
              {t("itinerary.retry")}
            </button>
          ) : null}
        </div>
      ) : null}

      <BudgetPanel
        plan={budgetPlan}
        expenses={expenses}
        onExpensesChange={persistExpenses}
        stops={(days[selectedDay]?.activities ?? []).map((activity) => ({
          id: activity.id,
          name: activity.name,
          note: activity.planning_note,
        }))}
      />
      <TripIntelligence
        activities={days[selectedDay]?.activities ?? []}
        onApplyStart={(activityId, start) =>
          updateActivity(selectedDay, activityId, { start_time: start })
        }
      />

      {view === "calendar" ? (
        <WeekCalendarView
          startDate={startDate}
          dayCities={dayCities}
          days={days.map((day) => ({
            dayId: day.dayId,
            dayIndex: day.dayIndex,
            label: `Day ${day.dayIndex + 1}`,
            dateLabel: "",
            city: dayCities?.[day.dayIndex]?.city,
            activities: day.activities,
          }))}
          onAddStop={(stop) => addTimedStop(stop)}
          onSelectActivity={(dayIndex) => {
            setSelectedDay(dayIndex);
            setExpanded((e) => ({ ...e, [dayIndex]: true }));
            setView("schedule");
          }}
        />
      ) : null}

      <div
        className={`grid gap-4 ${view === "split" ? "lg:grid-cols-2 lg:items-start" : "grid-cols-1"}`}
      >
        {(view === "schedule" || view === "split") && (
          <div className="min-w-0 space-y-2">
            <TripBookingsPanel
              legs={legs}
              activities={days.flatMap((d) => d.activities)}
              flightDate={startDate}
              onApplyDelay={(minutes) => {
                setDays((prev) => {
                  if (!prev[0]) return prev;
                  return prev.map((day, index) => {
                    if (index !== 0) return day;
                    return {
                      ...day,
                      activities: day.activities.map((activity) => {
                        if (!activity.start_time) return activity;
                        const nextStart = shiftActivityStartTime(
                          activity.start_time,
                          minutes,
                        );
                        return {
                          ...activity,
                          start_time: nextStart,
                          planning_note: [
                            activity.planning_note,
                            `Shifted +${minutes}m for flight delay`,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                        };
                      }),
                    };
                  });
                });
                setSaveState("idle");
              }}
            />
            {cityLegend.length ? (
              <div className="flex flex-wrap items-center gap-2 px-0.5">
                {cityLegend.map((item) => (
                  <button
                    key={item.city}
                    type="button"
                    onClick={() => setSelectedCity(item.city)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E1E5F0] bg-white px-2.5 py-1 text-xs font-medium text-[#080B3A]"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: item.color }}
                      aria-hidden
                    />
                    {item.city}
                  </button>
                ))}
              </div>
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
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{
                        background: (
                          dayCities?.[day.dayIndex]?.city
                            ? stopColorForKey(dayCities[day.dayIndex].city)
                            : stopColorForIndex(dayIndex)
                        ).solid,
                      }}
                      aria-hidden
                    />
                    <button
                      type="button"
                      className="font-semibold"
                      onClick={() => {
                        setSelectedDay(dayIndex);
                        setExpanded((e) => ({
                          ...e,
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
                      · {day.activities.length} {t("itinerary.stops")}
                    </span>
                    <DayWeatherBadge
                      startDate={startDate}
                      dayIndex={day.dayIndex}
                      city={
                        dayCities?.[day.dayIndex]?.city ||
                        destination.split(",")[0]
                      }
                      lat={
                        day.activities.find((a) => a.lat != null)?.lat ?? null
                      }
                      lng={
                        day.activities.find((a) => a.lng != null)?.lng ?? null
                      }
                    />
                  </span>
                  <button
                    type="button"
                    className="rounded-full bg-[#F5F7FF] px-2.5 py-1 text-[11px] font-semibold text-[#0400FF]"
                    onClick={() => {
                      setSelectedDay(dayIndex);
                      setExpanded((e) => ({
                        ...e,
                        [dayIndex]: !e[dayIndex],
                      }));
                    }}
                  >
                    {isOpen ? t("itinerary.hide") : t("itinerary.show")}
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
                                accent={
                                  (
                                    dayCities?.[day.dayIndex]?.city
                                      ? stopColorForKey(
                                          dayCities[day.dayIndex].city,
                                        )
                                      : stopColorForIndex(dayIndex)
                                  ).solid
                                }
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
                pins={stopPins}
                connect
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
  accent,
  onMoveDay,
  onUpdate,
  onDelete,
}: {
  activity: ActivityRow;
  dayIndex: number;
  dayCount: number;
  accent?: string;
  onMoveDay: (toDayIndex: number) => void;
  onUpdate: (patch: Partial<ActivityRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: activity.id });
  const [dragReady, setDragReady] = useState(false);
  useEffect(() => {
    setDragReady(true);
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: accent || "#0400FF",
  };
  const endsAt = displayEnd(activity);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden rounded-[16px] border border-l-4 bg-white shadow-[0_6px_18px_rgba(8,11,58,0.05)] ${
        activity.completed ? "border-[#E1E5F0] opacity-70" : "border-[#E1E5F0]"
      }`}
    >
      <div className="flex">
        <div className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 bg-[#F5F7FF] px-2 py-3 text-center">
          <button
            type="button"
            className="cursor-grab text-[10px] tracking-widest text-[#9299B5]"
            {...(dragReady ? attributes : {})}
            {...(dragReady ? listeners : {})}
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
              {activity.completed ? "Undo" : "Mark done"}
            </button>
            <button
              type="button"
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#DC2626]"
              onClick={onDelete}
            >
              Remove from Itinerary
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
