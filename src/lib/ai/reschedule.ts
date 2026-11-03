import { computeDayRoute, estimateTravelFallback } from "@/lib/maps";
import type { ActivityRow } from "@/lib/types/trip";
import type { PatchOp } from "./patch";
import { addMinutes, orderByRoutedNeighbor } from "./scheduler";

export type Schedulable = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  priority: string | null;
  sort_order: number;
  travel_minutes_from_prev?: number | null;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const t = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function priorityRank(p: string | null): number {
  if (p === "must_see") return 0;
  if (p === "preferred") return 1;
  return 2; // optional / unknown — drop first
}

/**
 * Recompute OSM/OSRM travel legs and start times for an ordered day.
 */
export async function retimeDayWithOsm(input: {
  activities: Schedulable[];
  dayStart: string;
  mode: "WALK" | "DRIVE" | "TRANSIT";
}): Promise<
  {
    id: string;
    startTime: string;
    endTime: string;
    travelMinutesFromPrev: number;
    sortOrder: number;
  }[]
> {
  const ordered = [...input.activities].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  if (!ordered.length) return [];

  const points = ordered.map((a) =>
    a.lat != null && a.lng != null
      ? { lat: a.lat, lng: a.lng }
      : { lat: 0, lng: 0 },
  );
  const hasCoords = ordered.every((a) => a.lat != null && a.lng != null);
  const route = hasCoords
    ? await computeDayRoute({ mode: input.mode, points })
    : null;

  let cursor = input.dayStart.slice(0, 5);
  const out: {
    id: string;
    startTime: string;
    endTime: string;
    travelMinutesFromPrev: number;
    sortOrder: number;
  }[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const act = ordered[i];
    const travel =
      i === 0 ? 0 : (route?.legs[i - 1]?.durationMinutes ?? 15);
    if (i > 0) {
      cursor = addMinutes(cursor, travel);
    }
    const duration = act.duration_minutes ?? 60;
    const startTime = cursor;
    const endTime = addMinutes(startTime, duration);
    out.push({
      id: act.id,
      startTime,
      endTime,
      travelMinutesFromPrev: travel,
      sortOrder: i,
    });
    cursor = endTime;
  }
  return out;
}

/**
 * Absorb a delay by dropping/moving overflow and retiming survivors with OSM —
 * not a uniform push of every stop.
 */
export async function planDelayReshuffle(input: {
  activities: ActivityRow[];
  delayMinutes: number;
  dayEnd?: string;
  mode?: "WALK" | "DRIVE" | "TRANSIT";
  nextDayIndex?: number | null;
}): Promise<{
  operations: PatchOp[];
  summary: string;
  suggestions: string[];
}> {
  const mode = input.mode ?? "WALK";
  const dayEnd = (input.dayEnd ?? "21:00").slice(0, 5);
  const dayEndMin = toMinutes(dayEnd);

  const sorted = [...input.activities].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  if (!sorted.length) {
    return {
      operations: [],
      summary: "No activities to reshuffle for this delay.",
      suggestions: [],
    };
  }

  const firstStart = (sorted[0].start_time ?? "09:00").slice(0, 5);
  const newDayStart = addMinutes(firstStart, input.delayMinutes);

  // Prefer keeping must-sees; drop optional/preferred that no longer fit.
  const candidates = [...sorted].sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return a.sort_order - b.sort_order;
  });

  const geoReady = candidates.filter(
    (a) => a.lat != null && a.lng != null,
  ) as (ActivityRow & { lat: number; lng: number })[];

  // Reorder by real path duration (bridges/detours), not crow-flies.
  let working: ActivityRow[] = candidates;
  if (geoReady.length >= 2) {
    const startPt = { lat: geoReady[0].lat, lng: geoReady[0].lng };
    const rest = geoReady.slice(1);
    const orderedRest = await orderByRoutedNeighbor(rest, startPt, mode);
    const noGeo = candidates.filter((a) => a.lat == null || a.lng == null);
    working = [geoReady[0], ...orderedRest, ...noGeo];
  }

  const keep: ActivityRow[] = [];
  const drop: ActivityRow[] = [];
  const moveNext: ActivityRow[] = [];

  // Greedy pack with path-aware travel estimates (OSRM retimes survivors after).
  let cursor = newDayStart;
  let prev: ActivityRow | null = null;
  for (const act of working) {
    const duration = act.duration_minutes ?? 60;
    let travel = 0;
    if (prev && prev.lat != null && prev.lng != null && act.lat != null && act.lng != null) {
      travel = estimateTravelFallback(
        mode,
        { lat: prev.lat, lng: prev.lng },
        { lat: act.lat, lng: act.lng },
      ).durationMinutes;
    } else if (prev) {
      travel = 15;
    }
    const startMin = toMinutes(cursor) + (prev ? travel : 0);
    const endMin = startMin + duration;
    if (endMin > dayEndMin + 30) {
      if (act.priority === "must_see" && input.nextDayIndex != null) {
        moveNext.push(act);
      } else if (act.priority === "must_see") {
        // Keep must-sees even if late; mark via update note later
        keep.push(act);
        cursor = fromMinutes(endMin);
        prev = act;
      } else {
        drop.push(act);
      }
      continue;
    }
    keep.push(act);
    cursor = fromMinutes(endMin);
    prev = act;
  }

  // If still nothing kept, keep the highest-priority single activity.
  if (!keep.length && working.length) {
    const best = [...working].sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
    )[0];
    keep.push(best);
    drop.push(...working.filter((a) => a.id !== best.id && !moveNext.includes(a)));
  }

  const timed = await retimeDayWithOsm({
    activities: keep.map((a, i) => ({ ...a, sort_order: i })),
    dayStart: newDayStart,
    mode,
  });

  const operations: PatchOp[] = [];

  for (const a of drop) {
    operations.push({ op: "delete", activityId: a.id });
  }

  for (const a of moveNext) {
    if (input.nextDayIndex == null) continue;
    operations.push({
      op: "move",
      activityId: a.id,
      toDayIndex: input.nextDayIndex,
      toSortOrder: 99,
    });
  }

  for (const t of timed) {
    const act = keep.find((k) => k.id === t.id);
    operations.push({
      op: "update",
      activityId: t.id,
      fields: {
        startTime: t.startTime,
        planningNote: `Rescheduled after ${input.delayMinutes}-min delay · ${t.travelMinutesFromPrev ? `${t.travelMinutesFromPrev} min transit from previous (OSM)` : "first stop of the day"}`,
      },
    });
    // Carry travel minutes via a dedicated op field on update — extend patch
    operations.push({
      op: "set_travel",
      activityId: t.id,
      travelMinutesFromPrev: t.travelMinutesFromPrev,
      endTime: `${t.endTime}:00`,
      sortOrder: t.sortOrder,
    });
  }

  const parts: string[] = [];
  parts.push(
    `Delay of ${input.delayMinutes} min → day now starts around ${newDayStart}.`,
  );
  if (drop.length) {
    parts.push(
      `Removed ${drop.length} stop(s) that no longer fit: ${drop.map((d) => d.name).join(", ")}.`,
    );
  }
  if (moveNext.length) {
    parts.push(
      `Moved ${moveNext.length} must-see(s) to day ${(input.nextDayIndex ?? 0) + 1}: ${moveNext.map((d) => d.name).join(", ")}.`,
    );
  }
  parts.push(
    `Retimed ${timed.length} remaining stop(s) with OSM travel times between them.`,
  );

  return {
    operations,
    summary: parts.join(" "),
    suggestions: [
      "Ask to restore a removed stop on another day",
      "Make the afternoon lighter if still too packed",
    ],
  };
}

export function transportModeFromPrefs(
  transport?: string | null,
): "WALK" | "DRIVE" | "TRANSIT" {
  if (transport === "driving") return "DRIVE";
  if (transport === "transit") return "TRANSIT";
  return "WALK";
}
