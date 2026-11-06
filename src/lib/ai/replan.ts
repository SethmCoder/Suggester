import type { ActivityRow } from "@/lib/types/trip";
import type { AssistantPatch } from "./patch";
import { addMinutes } from "./scheduler";

type DayInfo = { id: string; day_index: number };

function dayActivities(activities: ActivityRow[], days: DayInfo[], dayIndex: number) {
  const day = days.find((item) => item.day_index === dayIndex);
  if (!day) return [];
  return activities.filter((activity) => activity.day_id === day.id);
}

function dayIndexFromMessage(message: string, days: DayInfo[]): number {
  const numbered = message.match(/day\s+(\d+)/i);
  if (numbered) return Math.max(0, Number(numbered[1]) - 1);
  if (/tomorrow/i.test(message) && days.some((day) => day.day_index === 1)) return 1;
  return 0;
}

function outdoor(activity: ActivityRow): boolean {
  return /park|garden|beach|viewpoint|outdoor|trail|promenade/i.test(
    `${activity.name} ${activity.planning_note ?? ""}`,
  );
}

export function planRainChange(input: {
  message: string;
  days: DayInfo[];
  activities: ActivityRow[];
  replacement?: { name: string; lat: number; lng: number; placeId?: string; address?: string | null } | null;
}): AssistantPatch {
  const dayIndex = dayIndexFromMessage(input.message, input.days);
  const dayActs = dayActivities(input.activities, input.days, dayIndex);
  const outdoorStops = dayActs.filter(outdoor);
  const untouched = input.activities.filter((activity) => !dayActs.some((item) => item.id === activity.id));
  if (!outdoorStops.length) {
    return {
      summary: `Day ${dayIndex + 1} has no outdoor stop listed to swap. The other days stay as they are.`,
      operations: [],
      suggestions: [],
    };
  }
  const operations: AssistantPatch["operations"] = outdoorStops.map((stop) => ({
    op: "delete" as const,
    activityId: stop.id,
  }));
  const replacement = input.replacement;
  if (replacement) {
    operations.push({
      op: "insert",
      toDayIndex: dayIndex,
      placeId: replacement.placeId,
      name: replacement.name,
      lat: replacement.lat,
      lng: replacement.lng,
      address: replacement.address,
      startTime: outdoorStops[0].start_time?.slice(0, 5) || "11:00",
      durationMinutes: 75,
      priority: "preferred",
      planningNote: "Indoor replacement from the listed places. Hours are not confirmed.",
    });
  }
  return {
    summary: replacement
      ? `Day ${dayIndex + 1} swaps ${outdoorStops.map((stop) => stop.name).join(", ")} for ${replacement.name}. ${untouched.length} stops on other days stay put.`
      : `Day ${dayIndex + 1} drops ${outdoorStops.map((stop) => stop.name).join(", ")}. No listed indoor replacement was found, so nothing new was added.`,
    operations,
    suggestions: [],
  };
}

export function planTiredWalk(input: {
  message: string;
  days: DayInfo[];
  activities: ActivityRow[];
}): AssistantPatch {
  const dayIndex = dayIndexFromMessage(input.message, input.days);
  const dayActs = dayActivities(input.activities, input.days, dayIndex);
  const longest = [...dayActs].sort(
    (a, b) => (b.travel_minutes_from_prev ?? 0) - (a.travel_minutes_from_prev ?? 0),
  )[0];
  if (!longest || !(longest.travel_minutes_from_prev ?? 0)) {
    return {
      summary: `Day ${dayIndex + 1} has no listed walk long enough to drop. Other days stay as they are.`,
      operations: [],
    };
  }
  return {
    summary: `Day ${dayIndex + 1} drops ${longest.name}, the stop with the longest listed walk (${longest.travel_minutes_from_prev} min). Other days stay as they are.`,
    operations: [{ op: "delete", activityId: longest.id }],
  };
}

export function planCheaper(input: {
  message: string;
  days: DayInfo[];
  activities: ActivityRow[];
  replacement?: { name: string; lat: number; lng: number; placeId?: string } | null;
}): AssistantPatch {
  const dayIndex = dayIndexFromMessage(input.message, input.days);
  const dayActs = dayActivities(input.activities, input.days, dayIndex);
  const paid = dayActs.find((activity) => /a fee is listed/i.test(activity.planning_note ?? ""));
  if (!paid) {
    return {
      summary: `Day ${dayIndex + 1} has no stop with a listed fee to replace. Costs that are not listed were left alone.`,
      operations: [],
    };
  }
  const operations: AssistantPatch["operations"] = [{ op: "delete", activityId: paid.id }];
  if (input.replacement) {
    operations.push({
      op: "insert",
      toDayIndex: dayIndex,
      placeId: input.replacement.placeId,
      name: input.replacement.name,
      lat: input.replacement.lat,
      lng: input.replacement.lng,
      startTime: paid.start_time?.slice(0, 5) || "12:00",
      durationMinutes: paid.duration_minutes ?? 60,
      priority: "preferred",
      planningNote: "OpenStreetMap lists this as free.",
    });
  }
  return {
    summary: input.replacement
      ? `Day ${dayIndex + 1} replaces ${paid.name} with ${input.replacement.name}, which is listed as free.`
      : `Day ${dayIndex + 1} drops ${paid.name} because a fee is listed. No free listed replacement was found.`,
    operations,
  };
}

export function planLongerVisit(input: {
  message: string;
  days: DayInfo[];
  activities: ActivityRow[];
  dayEnd?: string;
  extraMinutes?: number;
}): AssistantPatch {
  const dayIndex = dayIndexFromMessage(input.message, input.days);
  const dayActs = dayActivities(input.activities, input.days, dayIndex);
  const named = input.message.match(/more time (?:at|in)\s+(.+)/i)?.[1]?.trim();
  const target =
    dayActs.find((activity) => named && activity.name.toLowerCase().includes(named.toLowerCase().replace(/[?.!]+$/, ""))) ??
    dayActs.find((activity) => /museum/i.test(activity.name)) ??
    dayActs[0];
  if (!target) {
    return { summary: "That day has no stop to extend.", operations: [] };
  }
  const extra = input.extraMinutes ?? 45;
  const duration = (target.duration_minutes ?? 60) + extra;
  const endLimit = input.dayEnd?.slice(0, 5) ?? "21:00";
  const [eh, em] = endLimit.split(":").map(Number);
  const endMinutes = (eh || 21) * 60 + (em || 0);
  const operations: AssistantPatch["operations"] = [
    { op: "update", activityId: target.id, fields: { durationMinutes: duration } },
  ];
  const dropped: string[] = [];
  const startIndex = dayActs.findIndex((activity) => activity.id === target.id);
  let cursor = clockMinutes(target.start_time ?? "10:00") + duration;
  for (const later of dayActs.slice(startIndex + 1)) {
    const travel = later.travel_minutes_from_prev ?? 15;
    const begin = cursor + travel;
    if (begin + (later.duration_minutes ?? 60) > endMinutes) {
      operations.push({ op: "delete", activityId: later.id });
      dropped.push(later.name);
    } else {
      operations.push({
        op: "update",
        activityId: later.id,
        fields: { startTime: addMinutes(minutesToClock(begin), 0).slice(0, 5) },
      });
      cursor = begin + (later.duration_minutes ?? 60);
    }
  }
  return {
    summary: dropped.length
      ? `${target.name} gets ${extra} more minutes. ${dropped.join(", ")} no longer fits before ${endLimit}.`
      : `${target.name} gets ${extra} more minutes. The rest of that day still fits.`,
    operations,
  };
}

function clockMinutes(value: string): number {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToClock(total: number): string {
  const minutes = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
