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
import { useCallback, useMemo, useState } from "react";
import { shiftActivityStartTime } from "@/lib/ai/assistant-local";
import type { AssistantPatch } from "@/lib/ai/patch";
import {
  countryFromDestination,
  destinationImageUrl,
} from "@/lib/destination-image";
import { PopularityBadge } from "./PopularityBadge";
import { TripMap } from "./TripMap";
import { AssistantPanel } from "./AssistantPanel";
import type { ActivityRow } from "@/lib/types/trip";

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
}: {
  tripId: string;
  destination: string;
  initialDays: { id: string; day_index: number }[];
  initialActivities: ActivityRow[];
  isDemo?: boolean;
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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });
  const [view, setView] = useState<"schedule" | "map" | "split">("split");
  const [selectedDay, setSelectedDay] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const flatActivities = useMemo(
    () => days.flatMap((d) => d.activities),
    [days],
  );

  const persist = useCallback(
    async (nextDays: DayGroup[]) => {
      setSaveState("saving");
      if (isDemo) {
        try {
          sessionStorage.setItem(
            `waypoint:demo:${tripId}`,
            JSON.stringify(nextDays),
          );
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
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
      const res = await fetch(`/api/trips/${tripId}/activities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activities: payload }),
      });
      setSaveState(res.ok ? "saved" : "error");
    },
    [tripId, isDemo],
  );

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
                        "Replaced by itinerary maker — verify before visiting",
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

  function deleteActivity(dayIndex: number, activityId: string) {
    setDays((prev) => {
      const copy = prev.map((d, i) =>
        i === dayIndex
          ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
          : d,
      );
      void persist(copy);
      return copy;
    });
  }

  const dayPins = days[selectedDay]?.activities
    .filter((a) => a.lat != null && a.lng != null)
    .map((a, i) => ({
      lat: a.lat!,
      lng: a.lng!,
      label: a.name,
      order: i + 1,
    }));

  const destName = destination.replace(/\s*\(Demo\)\s*/i, "").trim();
  const heroImg = destinationImageUrl(destName);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[16px] bg-[#10194A]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080B3A]/95 via-[#10194A]/75 to-transparent" />
        <div className="relative flex flex-col gap-4 px-5 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div>
            <p className="text-sm text-[#C5CAE5]">
              {countryFromDestination(destName)}
            </p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-white sm:text-[32px]">
              {destName}
            </h1>
            <p className="mt-1 text-sm text-[#C5CAE5]">
              {days.length} days · {flatActivities.length} activities ·{" "}
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Couldn’t save"
                    : "Up to date"}
            </p>
          </div>
          <div className="flex rounded-[12px] border border-[#292F68] bg-[#080B3A]/70 p-1 text-sm backdrop-blur">
            {(["schedule", "map", "split"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-[10px] px-3.5 py-1.5 capitalize ${
                  view === v
                    ? "bg-[#0400FF] text-white"
                    : "text-[#C5CAE5] hover:text-white"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div
        className={`grid gap-5 ${view === "split" ? "lg:grid-cols-2" : "grid-cols-1"}`}
      >
        {(view === "schedule" || view === "split") && (
          <div className="space-y-4">
            {days.map((day, dayIndex) => (
              <section
                key={day.dayId}
                className={`overflow-hidden rounded-[14px] border bg-white shadow-[0_4px_20px_rgba(8,11,58,0.05)] ${
                  selectedDay === dayIndex
                    ? "border-[#0400FF]/40"
                    : "border-[#E1E5F0]"
                }`}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                  onClick={() => {
                    setExpanded((e) => ({ ...e, [dayIndex]: !e[dayIndex] }));
                    setSelectedDay(dayIndex);
                  }}
                >
                  <span className="text-[16px] font-semibold text-[#080B3A]">
                    Day {day.dayIndex + 1}
                  </span>
                  <span className="rounded-full bg-[#DDE1FF] px-2.5 py-0.5 text-xs font-medium text-[#0400FF]">
                    {day.activities.length} activities
                  </span>
                </button>
                {expanded[dayIndex] !== false ? (
                  <div className="border-t border-[#E1E5F0] px-4 pb-4">
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
                          {day.activities.map((act) => (
                            <SortableActivity
                              key={act.id}
                              activity={act}
                              dayCount={days.length}
                              dayIndex={dayIndex}
                              onMoveDay={(to) => moveToDay(dayIndex, act.id, to)}
                              onUpdate={(patch) =>
                                updateActivity(dayIndex, act.id, patch)
                              }
                              onDelete={() => deleteActivity(dayIndex, act.id)}
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                    {!isDemo ? (
                      <RegenerateDayButton
                        tripId={tripId}
                        dayIndex={day.dayIndex}
                      />
                    ) : (
                      <p className="mt-4 border-t border-[#E1E5F0] pt-3 text-xs text-[#6B7280]">
                        Day regenerate is available after you sign up for a real
                        trip.
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}

        {(view === "map" || view === "split") && (
          <div className="min-h-[320px] lg:min-h-[480px]">
            <TripMap pins={dayPins ?? []} />
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

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-[12px] border border-[#E1E5F0] bg-[#F5F7FF] p-3.5"
    >
      <div className="flex gap-2">
        <button
          type="button"
          className="cursor-grab text-[#6B7280]"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`font-medium ${activity.completed ? "line-through opacity-60" : ""}`}>
              {activity.name}
            </p>
            <span className="shrink-0 text-xs capitalize text-[#6B7280]">
              {activity.priority?.replace("_", " ")}
            </span>
          </div>
          <p className="text-xs text-[#6B7280]">
            {activity.start_time?.slice(0, 5)} · {activity.duration_minutes} min
            {activity.travel_minutes_from_prev
              ? ` · ${activity.travel_minutes_from_prev} min travel`
              : ""}
          </p>
          {activity.address ? (
            <p className="text-xs text-[#6B7280]">{activity.address}</p>
          ) : null}
          <p className="mt-1 text-xs">
            Hours:{" "}
            <span className={activity.hours_verified ? "text-[#15803D]" : "text-[#B45309]"}>
              {activity.hours_verified ? "Verified" : "Unverified"}
            </span>
          </p>
          {activity.schedule_warnings?.map((w) => (
            <p key={w} className="text-xs text-[#B45309]">
              {w}
            </p>
          ))}
          <PopularityBadge
            label={activity.popularity_label}
            sources={activity.popularity_sources ?? undefined}
            attributionUrls={activity.popularity_attribution_urls ?? undefined}
          />
          {activity.planning_note ? (
            <p className="mt-2 text-sm text-[#6B7280]">{activity.planning_note}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {activity.website_uri ? (
              <a href={activity.website_uri} target="_blank" rel="noreferrer" className="text-[#0400FF]">
                Website
              </a>
            ) : null}
            {activity.google_maps_uri ? (
              <a href={activity.google_maps_uri} target="_blank" rel="noreferrer" className="text-[#0400FF]">
                Maps
              </a>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="time"
              className="rounded border border-[#D1D7E5] px-2 py-1 text-xs"
              value={activity.start_time?.slice(0, 5) ?? ""}
              onChange={(e) => onUpdate({ start_time: `${e.target.value}:00` })}
            />
            <input
              type="number"
              min={15}
              className="w-20 rounded border border-[#D1D7E5] px-2 py-1 text-xs"
              value={activity.duration_minutes ?? 60}
              onChange={(e) =>
                onUpdate({ duration_minutes: Number(e.target.value) })
              }
            />
            <button
              type="button"
              className="text-xs text-[#0400FF]"
              onClick={() => onUpdate({ completed: !activity.completed })}
            >
              {activity.completed ? "Undo done" : "Mark done"}
            </button>
            <button
              type="button"
              className="text-xs text-[#DC2626]"
              onClick={onDelete}
            >
              Delete
            </button>
            {dayCount > 1 ? (
              <select
                className="rounded border border-[#D1D7E5] px-2 py-1 text-xs"
                value={dayIndex}
                onChange={(e) => onMoveDay(Number(e.target.value))}
              >
                {Array.from({ length: dayCount }, (_, i) => (
                  <option key={i} value={i}>
                    Move to day {i + 1}
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
