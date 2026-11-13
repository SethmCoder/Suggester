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
import { PackingChecklist } from "./PackingChecklist";
import {
  normalizePacking,
  type PackingItem,
} from "@/lib/trips/packing";
import { TripIntelligence } from "./TripIntelligence";
import {
  WeekCalendarView,
  type CalendarNewStop,
} from "./WeekCalendarView";
import { StayAdviseBanner } from "./StayAdviseBanner";
import {
  LockedTimedStopForm,
} from "./LockedTimedStopForm";
import { calendarStopFromLockedInput } from "@/lib/trips/locked-stop";
import { itineraryToMarkdown } from "@/lib/trips/export-plan";
import { bookedHotelForDay } from "@/lib/trips/calendar-hotel";
import type { BudgetPlan } from "@/lib/trips/budget";
import {
  normalizeCategorySplit,
  normalizeExpenses,
  type ExpenseCategorySplit,
  type TripExpense,
} from "@/lib/trips/expenses";
import { rememberAddedPlace, rememberRemovedPlace } from "@/lib/trips/place-feedback";
import type { ActivityRow, LegTransitMode, TripLeg } from "@/lib/types/trip";
import {
  reindexByChronology,
  sortActivitiesChronologically,
} from "@/lib/trips/activity-order";
import { addCalendarDays, nightsBetween, nightsLabel } from "@/lib/trips/dates";
import {
  TripPlanSidebar,
  type TripDashTab,
} from "@/components/trips/TripPlanSidebar";
import { PlanningStages } from "@/components/planner/PlanningStages";
import { TripBookingsPanel } from "@/components/trips/TripBookingsPanel";
import {
  stopColorForIndex,
  stopColorForKey,
} from "@/lib/trips/stop-colors";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { ShareInviteButton } from "@/components/social/ShareInviteButton";

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
  initialCategorySplit,
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
  initialCategorySplit?: ExpenseCategorySplit;
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
  const [dashTab, setDashTab] = useState<TripDashTab>("itinerary");
  const [assistantForceOpen, setAssistantForceOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    function onSection(e: Event) {
      const section = (e as CustomEvent<{ section?: string }>).detail?.section;
      if (!section) return;
      const tab = section as TripDashTab;
      if (
        !(
          [
            "overview",
            "itinerary",
            "discover",
            "bookings",
            "map",
            "assistant",
          ] as TripDashTab[]
        ).includes(tab)
      ) {
        return;
      }
      setDashTab(tab);
      if (tab === "map") setView("map");
      if (tab === "itinerary") setView("schedule");
      if (tab === "assistant") setAssistantForceOpen(true);
      if (tab === "bookings") {
        window.setTimeout(() => {
          document.getElementById("bookings")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 50);
      }
    }
    window.addEventListener("waypoint:trip-section", onSection);
    const raw = typeof window !== "undefined"
      ? (window.location.hash.replace(/^#/, "") as TripDashTab)
      : null;
    if (
      raw &&
      (
        [
          "overview",
          "itinerary",
          "discover",
          "bookings",
          "map",
          "assistant",
        ] as TripDashTab[]
      ).includes(raw)
    ) {
      setDashTab(raw);
      if (raw === "map") setView("map");
      if (raw === "assistant") setAssistantForceOpen(true);
    }
    return () => window.removeEventListener("waypoint:trip-section", onSection);
  }, []);

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
  const [categorySplit, setCategorySplit] = useState<ExpenseCategorySplit>(() =>
    normalizeCategorySplit(initialCategorySplit, budgetPlan?.allocation),
  );
  const [expensesHydrated, setExpensesHydrated] = useState(false);
  const [liveBudget, setLiveBudget] = useState<BudgetPlan | undefined>(budgetPlan);
  const [wetWeather, setWetWeather] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [toolsOpen, setToolsOpen] = useState<"budget" | "packing" | "intel" | null>(
    null,
  );
  const [packing, setPacking] = useState<PackingItem[]>([]);

  useEffect(() => {
    function openToolFromSection(section: string) {
      if (section === "budget" || section === "packing") {
        setToolsOpen(section);
        window.requestAnimationFrame(() => {
          document.getElementById("trip-tools")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    }
    function onSection(e: Event) {
      const detail = (e as CustomEvent<{ section?: string }>).detail;
      if (detail?.section) openToolFromSection(detail.section);
    }
    function onHash() {
      openToolFromSection(window.location.hash.replace(/^#/, ""));
    }
    onHash();
    window.addEventListener("waypoint:trip-section", onSection);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("waypoint:trip-section", onSection);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  // Wet-weather signal for packing reseed (Open-Meteo via /api/weather).
  useEffect(() => {
    if (!startDate || !endDate) return;
    const city =
      dayCities?.find((d) => d.city)?.city ||
      legs.find((l) => l.city)?.city ||
      destination.replace(/\s*\(Demo\)\s*$/i, "").trim();
    const lat =
      dayCities?.find((d) => d.anchorLat)?.anchorLat ??
      legs.find((l) => l.lat != null)?.lat;
    const lng =
      dayCities?.find((d) => d.anchorLng)?.anchorLng ??
      legs.find((l) => l.lng != null)?.lng;
    const params = new URLSearchParams({
      startDate,
      endDate,
      date: startDate,
    });
    if (lat != null && lng != null) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    } else if (city) {
      params.set("city", city);
    } else {
      return;
    }
    let cancelled = false;
    fetch(`/api/weather?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("weather");
        return res.json() as Promise<{
          focus?: { wet?: boolean } | null;
          days?: { wet?: boolean }[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        const wet =
          Boolean(data.focus?.wet) ||
          (Array.isArray(data.days) && data.days.some((d) => d.wet));
        setWetWeather(wet);
      })
      .catch(() => {
        /* keep dry default */
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, destination, dayCities, legs]);
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
  // Only key off tripId + pendingBuild — wider deps remount/cancel mid-request
  // and leave buildStarted stuck so generation never retries.
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
          buildStarted.current = false;
          setBuildStatus("failed");
          setBuildError(
            typeof data.error === "string"
              ? data.error
              : "Could not generate this trip",
          );
          return;
        }
        const builtBudget = {
          total:
            typeof data.budget === "number" && data.budget > 0
              ? data.budget
              : budgetPlan?.total,
          currency:
            typeof data.currency === "string"
              ? data.currency
              : budgetPlan?.currency,
          allocation:
            data.budgetAllocation === "sights" ||
            data.budgetAllocation === "food" ||
            data.budgetAllocation === "getting-around" ||
            data.budgetAllocation === "mostly-free"
              ? data.budgetAllocation
              : budgetPlan?.allocation,
          restaurantStyle:
            data.restaurantStyle === "street" ||
            data.restaurantStyle === "casual" ||
            data.restaurantStyle === "sit-down" ||
            data.restaurantStyle === "mix"
              ? data.restaurantStyle
              : budgetPlan?.restaurantStyle,
        };
        const snap = offlineSnapshotFromGenerated({
          tripId,
          destination: data.destination || destination,
          startDate: startDate || new Date().toISOString().slice(0, 10),
          endDate: endDate || startDate || new Date().toISOString().slice(0, 10),
          days: data.days as GeneratedDay[],
          legs: (data.legs as TripLeg[] | undefined) ?? initialLegs,
          title: tripTitle,
          budget: builtBudget,
        });
        saveOfflineTrip({ ...snap, pendingBuild: undefined });
        applyFetchedPlan({
          days: snap.days,
          activities: snap.activities,
        });
        if (snap.legs?.length) setLegs(snap.legs);
        if (builtBudget.total && builtBudget.total > 0) {
          setLiveBudget(builtBudget);
        }
        setBuildStatus("ready");
      } catch (e) {
        if (cancelled) {
          buildStarted.current = false;
          return;
        }
        buildStarted.current = false;
        setBuildStatus("failed");
        setBuildError(
          e instanceof Error ? e.message : "Could not generate this trip",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable shell fill
  }, [pendingBuild, tripId]);
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
  // Demo trips ignore stale snapshots (contentVersion / destination mismatch).
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
          if (snap.expenseCategorySplit) {
            setCategorySplit(
              normalizeCategorySplit(snap.expenseCategorySplit, budgetPlan?.allocation),
            );
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
        const local = loadOfflineTrip(tripId);
        if (local?.expenses?.length) {
          setExpenses(normalizeExpenses(local.expenses));
        }
        if (local?.expenseCategorySplit) {
          setCategorySplit(
            normalizeCategorySplit(local.expenseCategorySplit, budgetPlan?.allocation),
          );
        }
        setExpensesHydrated(true);
      }
      try {
        const raw = localStorage.getItem(`waypoint:packing:${tripId}`);
        if (raw) setPacking(normalizePacking(JSON.parse(raw)));
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    setHydratedOffline(true);
  }, [tripId, hydratedOffline, initialLegs, expensesHydrated]);

  useEffect(() => {
    if (isDemo || tripId.startsWith("offline-")) return;
    void fetch(`/api/trips/${tripId}/preferences`)
      .then((r) => r.json())
      .then((data: { preferences?: { packing?: unknown } }) => {
        const remote = normalizePacking(data.preferences?.packing);
        if (remote.length) setPacking(remote);
      })
      .catch(() => null);
  }, [tripId, isDemo]);

  function pushBudgetPreferences(
    nextExpenses: TripExpense[],
    nextSplit: ExpenseCategorySplit,
    nextPacking: PackingItem[] = packing,
  ) {
    if (isDemo || tripId.startsWith("offline-") || !navigator.onLine) return;
    void fetch(`/api/trips/${tripId}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          expenses: nextExpenses,
          expenseCategorySplit: nextSplit,
          packing: nextPacking,
          ...(budgetPlan?.total != null ? { budget: budgetPlan.total } : {}),
          ...(budgetPlan?.currency ? { currency: budgetPlan.currency } : {}),
        },
      }),
    }).catch(() => {
      /* offline ok */
    });
  }

  function persistPacking(next: PackingItem[]) {
    setPacking(next);
    try {
      localStorage.setItem(
        `waypoint:packing:${tripId}`,
        JSON.stringify(next),
      );
    } catch {
      /* ignore */
    }
    pushBudgetPreferences(expenses, categorySplit, next);
  }

  function persistExpenses(next: TripExpense[]) {
    setExpenses(next);
    try {
      saveOfflineExpenses(tripId, next, categorySplit);
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
          expenseCategorySplit: categorySplit,
        });
      }
    } catch {
      /* localStorage may be unavailable */
    }
    pushBudgetPreferences(next, categorySplit);
  }

  function persistCategorySplit(next: ExpenseCategorySplit) {
    setCategorySplit(next);
    try {
      saveOfflineExpenses(tripId, expenses, next);
      const snap = loadOfflineTrip(tripId);
      if (snap) {
        saveOfflineTrip({ ...snap, expenseCategorySplit: next });
      }
    } catch {
      /* localStorage may be unavailable */
    }
    pushBudgetPreferences(expenses, next);
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
    const endTime =
      stop.endTime ??
      (() => {
        const [h, m] = stop.startTime.slice(0, 5).split(":").map(Number);
        const total = (h * 60 + m + stop.durationMinutes) % (24 * 60);
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
      })();
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
          place_id: stop.place_id ?? null,
          address: stop.address ?? null,
          lat: stop.lat ?? null,
          lng: stop.lng ?? null,
          start_time: stop.startTime,
          end_time: endTime,
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
          source:
            stop.stopKind === "meeting" ||
            stop.stopKind === "transport" ||
            stop.stopKind === "attraction"
              ? "user"
              : stop.useAi
                ? "ai"
                : "user",
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
    // Map shows the selected day so the path is one neighborhood walk,
    // not a zig-zag stitching every day together.
    const daysToShow = days.filter((d) => d.dayIndex === selectedDay);
    const source = daysToShow.length ? daysToShow : days;
    for (const day of source) {
      let order = 1;
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
          dayIndex: day.dayIndex,
        });
      }
    }
    return pins;
  }, [days, dayCities, selectedDay]);

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
        activeTab={dashTab}
        onTabChange={(tab) => {
          setDashTab(tab);
          if (tab === "map") setView("map");
          if (tab === "itinerary") setView("schedule");
          if (tab === "assistant") setAssistantForceOpen(true);
          if (tab === "bookings") {
            window.setTimeout(() => {
              document.getElementById("bookings")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }, 50);
          }
        }}
      />
      <div className="min-w-0 flex-1 space-y-5">
      <div className="rounded-[14px] border border-[#E1E5F0] bg-white px-4 py-3">
        <PlanningStages current="organize" />
      </div>
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
            onClick={() => {
              const md = itineraryToMarkdown({
                destination: destName,
                startDate,
                endDate,
                days: days.map((day) => ({
                  dayIndex: day.dayIndex,
                  city: dayCities?.[day.dayIndex]?.city,
                  activities: day.activities,
                })),
              });
              const mark = (ok: boolean) => {
                setCopyState(ok ? "copied" : "error");
                window.setTimeout(() => setCopyState("idle"), 2000);
              };
              const fallbackCopy = () => {
                try {
                  const ta = document.createElement("textarea");
                  ta.value = md;
                  ta.setAttribute("readonly", "");
                  ta.style.position = "fixed";
                  ta.style.left = "-9999px";
                  document.body.appendChild(ta);
                  ta.select();
                  const ok = document.execCommand("copy");
                  document.body.removeChild(ta);
                  mark(ok);
                } catch {
                  mark(false);
                }
              };
              if (navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(md).then(() => mark(true)).catch(fallbackCopy);
              } else {
                fallbackCopy();
              }
            }}
            className="rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-1.5 text-sm font-semibold text-[#080B3A] shadow-sm transition hover:border-[#0400FF]/25 hover:bg-[#F5F7FF]"
          >
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy itinerary"}
          </button>
          {!isDemo && /^[0-9a-f-]{36}$/i.test(tripId) ? (
            <ShareInviteButton kind="trip" resourceId={tripId} />
          ) : null}
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
      <StayAdviseBanner tripId={tripId} />
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

      <div
        id="trip-tools"
        className="flex flex-wrap gap-2 rounded-[14px] border border-[#E1E5F0] bg-white p-2 shadow-[0_4px_16px_rgba(8,11,58,0.04)]"
      >
        {(
          [
            { id: "budget" as const, label: "Budget" },
            { id: "packing" as const, label: "Sample lists" },
            { id: "intel" as const, label: "Day check" },
          ] as const
        ).map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() =>
              setToolsOpen((cur) => (cur === tool.id ? null : tool.id))
            }
            className={`rounded-[10px] px-3.5 py-2 text-sm font-semibold transition ${
              toolsOpen === tool.id
                ? "bg-[#0400FF] text-white"
                : "text-[#6B7280] hover:bg-[#F5F7FF] hover:text-[#080B3A]"
            }`}
          >
            {tool.label}
          </button>
        ))}
        <p className="ml-auto self-center px-2 text-[11px] text-[#9299B5]">
          Tools stay tucked away until you need them
        </p>
      </div>

      {toolsOpen === "budget" ? (
        <BudgetPanel
          tripId={tripId}
          isDemo={isDemo}
          plan={liveBudget ?? budgetPlan}
          onPlanChange={(next) => {
            setLiveBudget(next);
            const snap = loadOfflineTrip(tripId);
            if (snap) {
              saveOfflineTrip({
                ...snap,
                budget: {
                  total: next.total,
                  currency: next.currency,
                  allocation: next.allocation,
                  restaurantStyle: next.restaurantStyle,
                },
              });
            }
            if (!isDemo && !tripId.startsWith("offline-") && navigator.onLine) {
              void fetch(`/api/trips/${tripId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  preferences: {
                    budget: next.total,
                    currency: next.currency,
                    budgetAllocation: next.allocation,
                    restaurantStyle: next.restaurantStyle,
                  },
                }),
              }).catch(() => null);
            }
          }}
          expenses={expenses}
          categorySplit={categorySplit}
          onCategorySplitChange={persistCategorySplit}
          onExpensesChange={persistExpenses}
          stops={(days[selectedDay]?.activities ?? []).map((activity) => ({
            id: activity.id,
            name: activity.name,
            note: activity.planning_note,
          }))}
        />
      ) : null}
      {toolsOpen === "packing" ? (
        <PackingChecklist
          items={packing}
          onChange={persistPacking}
          party={liveBudget?.party ?? budgetPlan?.party}
          wetWeather={wetWeather}
          destination={destName}
          durationDays={
            startDate && endDate
              ? nightsBetween(startDate, endDate) + 1
              : days.length
          }
        />
      ) : null}
      {toolsOpen === "intel" ? (
        <TripIntelligence
          activities={days[selectedDay]?.activities ?? []}
          onApplyStart={(activityId, start) =>
            updateActivity(selectedDay, activityId, { start_time: start })
          }
        />
      ) : null}

      {view === "calendar" ? (
        <WeekCalendarView
          startDate={startDate}
          dayCities={dayCities}
          legs={legs}
          days={days.map((day) => ({
            dayId: day.dayId,
            dayIndex: day.dayIndex,
            label: `Day ${day.dayIndex + 1}`,
            dateLabel: "",
            city: dayCities?.[day.dayIndex]?.city,
            activities: day.activities,
          }))}
          onAddStop={(stop) => addTimedStop(stop)}
          onUpdateLeg={updateLeg}
          onSelectActivity={(dayIndex) => {
            setSelectedDay(dayIndex);
            setExpanded((e) => ({ ...e, [dayIndex]: true }));
            setView("schedule");
          }}
        />
      ) : null}

      {dashTab === "overview" ? (
        <section
          id="overview-panel"
          className="space-y-3 rounded-[14px] border border-[#E1E5F0] bg-white p-5 shadow-[0_2px_12px_rgba(8,11,58,0.04)]"
        >
          <h2 className="text-lg font-semibold text-[#080B3A]">Trip overview</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9299B5]">
                Destination
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-[#080B3A]">
                {destName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9299B5]">
                Dates
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-[#080B3A]">
                {startDate
                  ? `${formatTripDate(startDate, "short")}${
                      endDate ? ` – ${formatTripDate(endDate, "long")}` : ""
                    }`
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9299B5]">
                Schedule
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-[#080B3A]">
                {days.length} days · {flatActivities.length} stops
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9299B5]">
                Cities
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-[#080B3A]">
                {legs.map((l) => l.city).filter(Boolean).join(" → ") || destName}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            {(
              [
                ["itinerary", "View itinerary"],
                ["bookings", "Bookings"],
                ["map", "Map"],
                ["discover", "Discover places"],
                ["assistant", "Ask assistant"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                className="rounded-full bg-[#F5F7FF] px-3 py-1.5 text-xs font-semibold text-[#0400FF]"
                onClick={() => {
                  setDashTab(tab);
                  window.history.replaceState(null, "", `/trips/${tripId}#${tab}`);
                  if (tab === "map") setView("map");
                  if (tab === "assistant") setAssistantForceOpen(true);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {dashTab === "discover" ? (
        <section className="space-y-3 rounded-[14px] border border-[#E1E5F0] bg-white p-5 shadow-[0_2px_12px_rgba(8,11,58,0.04)]">
          <h2 className="text-lg font-semibold text-[#080B3A]">
            Discover near this trip
          </h2>
          <p className="text-sm text-[#6B7280]">
            Search real places and add them to a day.
          </p>
          <AddStopSearch
            near={(() => {
              const anchored = flatActivities.find(
                (a) => a.lat != null && a.lng != null,
              );
              return anchored
                ? { lat: anchored.lat!, lng: anchored.lng! }
                : null;
            })()}
            onPick={(hit) => {
              setSelectedPlace({
                name: hit.name,
                lat: hit.lat,
                lng: hit.lng,
                address: hit.address,
                dayIndex: selectedDay,
              });
              setDashTab("itinerary");
              setView("split");
            }}
          />
          <a
            href={`/discover?q=${encodeURIComponent(destName)}`}
            className="inline-block text-sm font-semibold text-[#0400FF]"
          >
            Browse destination Discover →
          </a>
        </section>
      ) : null}

      <div
        className={`grid gap-4 ${view === "split" ? "lg:grid-cols-2 lg:items-start" : "grid-cols-1"} ${
          dashTab === "overview" || dashTab === "discover" ? "hidden" : ""
        }`}
      >
        {(view === "schedule" || view === "split" || dashTab === "bookings") &&
          dashTab !== "map" && (
          <div className="min-w-0 space-y-2">
            <TripBookingsPanel
              tripId={tripId}
              destination={destination}
              legs={legs}
              activities={days.flatMap((d) => d.activities)}
              flightDate={startDate}
              onBookingAdded={() => {
                const snap = loadOfflineTrip(tripId);
                if (snap?.dayGroups?.length) {
                  setDays(
                    snap.dayGroups.map((group, index) => ({
                      dayId: group.dayId,
                      dayIndex: group.dayIndex ?? index,
                      activities: group.activities ?? [],
                    })),
                  );
                }
                if (snap?.legs?.length) setLegs(snap.legs);
                setSaveState("saved");
              }}
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
            <div
              className={`rounded-[14px] border border-[#E1E5F0] bg-white px-3 py-2 shadow-[0_2px_12px_rgba(8,11,58,0.04)] sm:px-4 ${
                dashTab === "bookings" ? "hidden" : ""
              }`}
            >
              {days.map((day, dayIndex) => {
                const isOpen = Boolean(expanded[dayIndex]);
                const bookedHotel = bookedHotelForDay({
                  dayIndex: day.dayIndex,
                  dayCities,
                  legs,
                  activities: day.activities,
                });
                const dayIso =
                  startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate)
                    ? addCalendarDays(startDate.slice(0, 10), day.dayIndex)
                    : null;
                const dateLabel = dayIso
                  ? formatTripDate(dayIso, "long")
                  : `Day ${day.dayIndex + 1}`;
                const cityLabel = dayCities?.[day.dayIndex]?.city;
                const accent = (
                  cityLabel
                    ? stopColorForKey(cityLabel)
                    : stopColorForIndex(dayIndex)
                ).solid;

                return (
                  <section
                    key={day.dayId}
                    className={`border-b border-[#E8EBF5] last:border-b-0 ${
                      selectedDay === dayIndex ? "bg-[#F8F9FF]" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3 py-3">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => {
                          setSelectedDay(dayIndex);
                          setExpanded((e) => ({
                            ...e,
                            [dayIndex]: !e[dayIndex],
                          }));
                        }}
                      >
                        <p className="text-[13px] font-semibold tracking-wide text-[#080B3A]">
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ background: accent }}
                            aria-hidden
                          />
                          {dateLabel}
                          {cityLabel ? (
                            <span className="font-normal text-[#6B7280]">
                              {" "}
                              · {cityLabel}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 pl-4 text-[11px] text-[#9299B5]">
                          Day {day.dayIndex + 1} · {day.activities.length}{" "}
                          {t("itinerary.stops")}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <DayWeatherBadge
                          startDate={startDate}
                          dayIndex={day.dayIndex}
                          city={cityLabel || destination.split(",")[0]}
                          lat={
                            day.activities.find((a) => a.lat != null)?.lat ??
                            null
                          }
                          lng={
                            day.activities.find((a) => a.lng != null)?.lng ??
                            null
                          }
                        />
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-[#0400FF]"
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
                    </div>

                    {bookedHotel ? (
                      <p className="mb-2 rounded-[6px] bg-[#080B3A] px-2.5 py-1 text-[10px] font-semibold text-white">
                        Stay · {bookedHotel.name}
                      </p>
                    ) : null}

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => onDragEnd(e, dayIndex)}
                    >
                      <SortableContext
                        items={day.activities.map((a) => a.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="relative ml-1 border-l border-[#DDE1FF] pl-3 pb-2">
                          {day.activities.map((act, actIndex) => (
                            <Fragment key={act.id}>
                              {actIndex > 0 &&
                              (act.travel_minutes_from_prev ?? 0) > 0 ? (
                                <li className="list-none py-0.5 pl-1 text-[10px] text-[#9299B5]">
                                  ↓ {act.travel_minutes_from_prev} min
                                </li>
                              ) : null}
                              <SortableActivity
                                activity={act}
                                dayCount={days.length}
                                dayIndex={dayIndex}
                                accent={accent}
                                compact
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
                          {!day.activities.length ? (
                            <li className="list-none py-2 text-[12px] text-[#9299B5]">
                              No stops yet
                            </li>
                          ) : null}
                        </ul>
                      </SortableContext>
                    </DndContext>

                    {isOpen ? (
                      <div className="pb-3 pl-1">
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
                        <div className="mt-2 border-t border-[#E1E5F0] pt-2">
                          <LockedTimedStopForm
                            dayLabel={dateLabel}
                            onSubmit={(input) =>
                              addTimedStop(
                                calendarStopFromLockedInput(dayIndex, input),
                              )
                            }
                          />
                        </div>
                        {!isDemo ? (
                          <RegenerateDayButton
                            tripId={tripId}
                            dayIndex={day.dayIndex}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {(view === "map" || view === "split" || dashTab === "map") && (
          <div
            className={
              view === "split" && dashTab !== "map"
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
        forceOpen={assistantForceOpen || dashTab === "assistant"}
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
  compact = false,
  onMoveDay,
  onUpdate,
  onDelete,
}: {
  activity: ActivityRow;
  dayIndex: number;
  dayCount: number;
  accent?: string;
  compact?: boolean;
  onMoveDay: (toDayIndex: number) => void;
  onUpdate: (patch: Partial<ActivityRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: activity.id });
  const [dragReady, setDragReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setDragReady(true);
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: accent || "#0400FF",
  };
  const endsAt = displayEnd(activity);
  const transitMode = transitModeFromActivity(activity);
  const timeLabel = activity.start_time?.slice(0, 5) || "—";
  const placeCue = activity.address?.split(",")[0]?.trim();

  if (compact) {
    return (
      <li ref={setNodeRef} style={style} className="list-none">
        <div
          className={`group flex items-center gap-2 py-1.5 ${
            activity.completed ? "opacity-60" : ""
          }`}
        >
          <button
            type="button"
            className="cursor-grab shrink-0 text-[10px] tracking-widest text-[#C5CAE5] hover:text-[#9299B5]"
            {...(dragReady ? attributes : {})}
            {...(dragReady ? listeners : {})}
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </button>
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: accent || "#0400FF" }}
            aria-hidden
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setOpen((v) => !v)}
          >
            <p
              className={`truncate text-[13px] leading-snug text-[#080B3A] ${
                activity.completed ? "line-through" : ""
              }`}
            >
              <span className="tabular-nums font-medium text-[#6B7280]">
                {timeLabel}
              </span>
              <span className="mx-1.5 text-[#C5CAE5]">·</span>
              <span className="font-semibold">{activity.name}</span>
              {placeCue ? (
                <>
                  <span className="mx-1.5 text-[#C5CAE5]">·</span>
                  <span className="font-normal text-[#9299B5]">{placeCue}</span>
                </>
              ) : null}
            </p>
          </button>
          {transitMode ? <TransitModeChip mode={transitMode} /> : null}
        </div>
        {open ? (
          <div className="mb-2 ml-6 rounded-[10px] border border-[#E1E5F0] bg-[#FAFBFF] px-3 py-2">
            {endsAt ? (
              <p className="text-[11px] text-[#6B7280]">Until {endsAt}</p>
            ) : null}
            {activity.planning_note ? (
              <p className="mt-1 text-[11px] text-[#6B7280]">
                {activity.planning_note}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="time"
                aria-label="Start time"
                className="rounded-[8px] border border-[#D1D7E5] bg-white px-2 py-1 text-xs"
                value={activity.start_time?.slice(0, 5) ?? ""}
                onChange={(e) =>
                  onUpdate({ start_time: `${e.target.value}:00` })
                }
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
        ) : null}
      </li>
    );
  }

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
            {timeLabel}
          </span>
          <span className="text-[10px] text-[#6B7280]">
            {activity.duration_minutes ?? 60} min
          </span>
        </div>
        <div className="min-w-0 flex-1 px-3.5 py-3">
          {transitMode ? (
            <div className="mb-1.5">
              <TransitModeChip mode={transitMode} />
            </div>
          ) : null}
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
