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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{destination}</h1>
          <p className="text-sm text-[#6B7280]">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Couldn’t save"
                  : `${flatActivities.length} activities`}
          </p>
        </div>
        <div className="flex rounded-lg border border-[#E5E7EB] bg-white p-1 text-sm">
          {(["schedule", "map", "split"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 capitalize ${
                view === v ? "bg-[#EEEEFF] text-[#1616C9]" : "text-[#6B7280]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`grid gap-4 ${view === "split" ? "lg:grid-cols-2" : "grid-cols-1"}`}
      >
        {(view === "schedule" || view === "split") && (
          <div className="space-y-4">
            {days.map((day, dayIndex) => (
              <section
                key={day.dayId}
                className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() => {
                    setExpanded((e) => ({ ...e, [dayIndex]: !e[dayIndex] }));
                    setSelectedDay(dayIndex);
                  }}
                >
                  <span className="font-semibold">Day {day.dayIndex + 1}</span>
                  <span className="text-xs text-[#6B7280]">
                    {day.activities.length} stops
                  </span>
                </button>
                {expanded[dayIndex] !== false ? (
                  <div className="border-t border-[#E5E7EB] px-4 pb-4">
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
                      <p className="mt-4 border-t border-[#E5E7EB] pt-3 text-xs text-[#6B7280]">
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

      <AssistantPanel tripId={tripId} isDemo={isDemo} />
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
      className="rounded-lg border border-[#E5E7EB] bg-[#F7F8FC] p-3"
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
              <a href={activity.website_uri} target="_blank" rel="noreferrer" className="text-[#1616C9]">
                Website
              </a>
            ) : null}
            {activity.google_maps_uri ? (
              <a href={activity.google_maps_uri} target="_blank" rel="noreferrer" className="text-[#1616C9]">
                Maps
              </a>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="time"
              className="rounded border border-[#D1D5DB] px-2 py-1 text-xs"
              value={activity.start_time?.slice(0, 5) ?? ""}
              onChange={(e) => onUpdate({ start_time: `${e.target.value}:00` })}
            />
            <input
              type="number"
              min={15}
              className="w-20 rounded border border-[#D1D5DB] px-2 py-1 text-xs"
              value={activity.duration_minutes ?? 60}
              onChange={(e) =>
                onUpdate({ duration_minutes: Number(e.target.value) })
              }
            />
            <button
              type="button"
              className="text-xs text-[#1616C9]"
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
                className="rounded border border-[#D1D5DB] px-2 py-1 text-xs"
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
    <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E7EB] pt-3">
      <button
        type="button"
        className="text-xs text-[#1616C9]"
        onClick={() => regen()}
      >
        Regenerate day
      </button>
      <button type="button" className="text-xs text-[#1616C9]" onClick={() => regen("relaxed")}>
        More relaxed
      </button>
      <button type="button" className="text-xs text-[#1616C9]" onClick={() => regen("optimize_geo")}>
        Optimize route
      </button>
      {msg ? <p className="w-full text-xs text-[#6B7280]">{msg}</p> : null}
    </div>
  );
}
