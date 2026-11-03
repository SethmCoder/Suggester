import type { ActivityRow } from "@/lib/types/trip";
import type { AssistantPatch } from "./patch";
import { addMinutes } from "./scheduler";

type DayInfo = { id: string; day_index: number };

/**
 * Heuristic itinerary assistant for demo mode and Groq fallback.
 * Flight delays reshuffle the day (drop/move overflow + OSM retimes), not a blind push.
 */
export function buildLocalAssistantPatch(input: {
  message: string;
  days: DayInfo[];
  activities: ActivityRow[];
  dayEnd?: string;
  transport?: string;
}): AssistantPatch {
  const msg = input.message.toLowerCase();
  const suggestions: string[] = [];

  // Flight / arrival delay: "flight delayed 2 hours", "arrive 90 minutes late"
  const delayMatch =
    msg.match(
      /(?:flight|plane|arrival|arrive|landing)?\s*(?:is\s+)?(?:delayed|late)\s*(?:by\s*)?(\d+)\s*(hours?|hrs?|minutes?|mins?)/i,
    ) ||
    msg.match(/(\d+)\s*(hours?|hrs?|minutes?|mins?)\s*(?:delay|late|behind)/i);

  if (delayMatch || /flight\s+delay|delayed\s+flight|missed\s+connection/i.test(msg)) {
    let minutes = 120;
    if (delayMatch) {
      const n = Number(delayMatch[1]);
      const unit = delayMatch[2].toLowerCase();
      minutes = unit.startsWith("h") ? n * 60 : n;
    }
    const dayIndex = detectDayIndex(msg, input.days) ?? 0;
    const dayActs = activitiesForDay(input.activities, input.days, dayIndex);
    if (!dayActs.length) {
      return {
        summary: `I understood a ~${minutes}-minute delay, but day ${dayIndex + 1} has no activities to adjust.`,
        operations: [],
        suggestions: [
          "Try: “My flight is delayed by 2 hours on day 1”",
          "Or move an activity: “Move the Louvre to day 2”",
        ],
      };
    }

    // Synchronous fallback shape; callers that need OSM should use buildLocalAssistantPatchAsync.
    // For sync API (demo/tests), emit a structured reshuffle plan with haversine estimates only.
    return buildSyncDelayPatch({
      minutes,
      dayIndex,
      dayActs,
      days: input.days,
      dayEnd: input.dayEnd,
    });
  }

  // Replace / change a place: "change the louvre to orsay", "replace eiffel with ..."
  const replaceMatch = msg.match(
    /(?:change|replace|swap)\s+(?:the\s+)?(.+?)\s+(?:to|with|for)\s+(.+)/i,
  );
  if (replaceMatch) {
    const fromHint = replaceMatch[1].trim();
    const toName = capitalize(replaceMatch[2].trim().replace(/[.?!.]+$/, ""));
    const act = findActivity(input.activities, fromHint);
    if (act) {
      return {
        summary: `Replace “${act.name}” with “${toName}” (suggested change — verify the place when you have Maps connected).`,
        operations: [
          {
            op: "replace",
            activityId: act.id,
            newName: toName,
            planningNote: `User-requested swap from ${act.name}. Confirm details before visiting.`,
          },
        ],
        suggestions: [
          `Also try: “Move ${toName} to another day”`,
          "Ask for a quieter alternative near your hotel.",
        ],
      };
    }
    suggestions.push(`I couldn’t find “${fromHint}” on this itinerary.`);
  }

  // Move activity to another day
  const moveMatch = msg.match(
    /move\s+(?:the\s+)?(.+?)\s+to\s+(?:day\s*)?(\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  );
  if (moveMatch) {
    const act = findActivity(input.activities, moveMatch[1]);
    const toDay = parseDayToken(moveMatch[2], input.days);
    if (act && toDay != null) {
      return {
        summary: `Move “${act.name}” to day ${toDay + 1}.`,
        operations: [
          {
            op: "move",
            activityId: act.id,
            toDayIndex: toDay,
            toSortOrder: 99,
          },
        ],
        suggestions: ["Say “make that day less busy” after moving."],
      };
    }
  }

  // Remove / skip a place
  const removeMatch = msg.match(
    /(?:remove|delete|skip|cancel)\s+(?:the\s+)?(.+)/i,
  );
  if (removeMatch) {
    const act = findActivity(input.activities, removeMatch[1]);
    if (act) {
      return {
        summary: `Remove “${act.name}” from the itinerary.`,
        operations: [{ op: "delete", activityId: act.id }],
        suggestions: ["I can suggest a nearby replacement if you ask."],
      };
    }
  }

  // Suggest alternatives / less busy
  if (/less busy|too packed|too many|relax|quieter|alternative|suggest|recommend/i.test(msg)) {
    const dayIndex = detectDayIndex(msg, input.days) ?? busiestDay(input);
    const dayActs = activitiesForDay(input.activities, input.days, dayIndex);
    const optional = dayActs.filter(
      (a) => a.priority === "optional" || a.priority === "preferred",
    );
    const target = optional[optional.length - 1] ?? dayActs[dayActs.length - 1];
    if (target) {
      return {
        summary: `To lighten day ${dayIndex + 1}, remove or shorten “${target.name}”. Here is a proposed removal — approve to apply.`,
        operations: [{ op: "delete", activityId: target.id }],
        suggestions: [
          "Replace it with a café break near your other stops.",
          "Or reshuffle after a flight delay.",
        ],
      };
    }
  }

  return {
    summary:
      "I can adjust this itinerary for you. Try a specific request — for example a flight delay, swapping a place, or moving an activity.",
    operations: [],
    suggestions: [
      "My flight is delayed by 2 hours on day 1",
      "Change the Louvre to Musée d'Orsay",
      "Move the Eiffel Tower visit to day 3",
      "Make day 2 less busy",
      "Remove the afternoon stop on day 1",
    ],
  };
}

/** Async variant that uses OSM routing for delay reshuffles. */
export async function buildLocalAssistantPatchAsync(input: {
  message: string;
  days: DayInfo[];
  activities: ActivityRow[];
  dayEnd?: string;
  transport?: string;
}): Promise<AssistantPatch> {
  const msg = input.message.toLowerCase();
  const delayMatch =
    msg.match(
      /(?:flight|plane|arrival|arrive|landing)?\s*(?:is\s+)?(?:delayed|late)\s*(?:by\s*)?(\d+)\s*(hours?|hrs?|minutes?|mins?)/i,
    ) ||
    msg.match(/(\d+)\s*(hours?|hrs?|minutes?|mins?)\s*(?:delay|late|behind)/i);

  if (delayMatch || /flight\s+delay|delayed\s+flight|missed\s+connection/i.test(msg)) {
    let minutes = 120;
    if (delayMatch) {
      const n = Number(delayMatch[1]);
      const unit = delayMatch[2].toLowerCase();
      minutes = unit.startsWith("h") ? n * 60 : n;
    }
    const dayIndex = detectDayIndex(msg, input.days) ?? 0;
    const dayActs = activitiesForDay(input.activities, input.days, dayIndex);
    if (!dayActs.length) {
      return buildLocalAssistantPatch(input);
    }
    const nextDay = input.days.find((d) => d.day_index === dayIndex + 1);
    const { planDelayReshuffle, transportModeFromPrefs } = await import(
      "./reschedule"
    );
    return planDelayReshuffle({
      activities: dayActs,
      delayMinutes: minutes,
      dayEnd: input.dayEnd,
      mode: transportModeFromPrefs(input.transport),
      nextDayIndex: nextDay ? nextDay.day_index : null,
    });
  }

  return buildLocalAssistantPatch(input);
}

/** Sync reshuffle for tests/demo when OSM is skipped. */
function buildSyncDelayPatch(input: {
  minutes: number;
  dayIndex: number;
  dayActs: ActivityRow[];
  days: DayInfo[];
  dayEnd?: string;
}): AssistantPatch {
  const dayEnd = (input.dayEnd ?? "21:00").slice(0, 5);
  const dayEndMin = timeToMin(dayEnd);
  const sorted = [...input.dayActs].sort((a, b) => a.sort_order - b.sort_order);
  const firstStart = (sorted[0]?.start_time ?? "09:00").slice(0, 5);
  const newStart = addMinutes(firstStart, input.minutes);

  const drop: ActivityRow[] = [];
  const keep: ActivityRow[] = [];
  let cursor = newStart;

  for (let i = 0; i < sorted.length; i++) {
    const act = sorted[i];
    const duration = act.duration_minutes ?? 60;
    const travel = i === 0 ? 0 : act.travel_minutes_from_prev || 15;
    if (i > 0) cursor = addMinutes(cursor, travel);
    const end = addMinutes(cursor, duration);
    if (timeToMin(end) > dayEndMin + 30 && act.priority !== "must_see") {
      drop.push(act);
      continue;
    }
    keep.push({ ...act });
    // advance cursor for next
    cursor = end;
  }

  const nextDay = input.days.find((d) => d.day_index === input.dayIndex + 1);
  const operations: AssistantPatch["operations"] = [];

  for (const a of drop) {
    // Move must-sees if somehow in drop; otherwise delete soft stops
    if (a.priority === "must_see" && nextDay) {
      operations.push({
        op: "move",
        activityId: a.id,
        toDayIndex: nextDay.day_index,
        toSortOrder: 99,
      });
    } else {
      operations.push({ op: "delete", activityId: a.id });
    }
  }

  let t = newStart;
  keep.forEach((a, i) => {
    const travel = i === 0 ? 0 : a.travel_minutes_from_prev || 15;
    if (i > 0) t = addMinutes(t, travel);
    const duration = a.duration_minutes ?? 60;
    const end = addMinutes(t, duration);
    operations.push({
      op: "update",
      activityId: a.id,
      fields: {
        startTime: t,
        planningNote: `Rescheduled after ${input.minutes}-min delay (not a blind push)`,
      },
    });
    operations.push({
      op: "set_travel",
      activityId: a.id,
      travelMinutesFromPrev: travel,
      endTime: `${end}:00`,
      sortOrder: i,
    });
    t = end;
  });

  return {
    summary: `Reshuffled day ${input.dayIndex + 1} for a ${input.minutes}-minute delay (new start ~${newStart}). ${
      drop.length
        ? `Dropped or moved ${drop.length} stop(s) that no longer fit.`
        : "All stops still fit after retiming."
    } Remaining activities were re-spaced with travel buffers.`,
    operations,
    suggestions: [
      "Restore a removed stop on another day",
      "Make the day lighter if it still feels packed",
    ],
  };
}

function timeToMin(hhmm: string) {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function activitiesForDay(
  activities: ActivityRow[],
  days: DayInfo[],
  dayIndex: number,
) {
  const day = days.find((d) => d.day_index === dayIndex);
  if (!day) return [];
  return activities
    .filter((a) => a.day_id === day.id)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function findActivity(activities: ActivityRow[], hint: string) {
  const h = hint.toLowerCase().replace(/[.?!.]+$/, "").trim();
  return (
    activities.find((a) => a.name.toLowerCase().includes(h)) ||
    activities.find((a) => h.includes(a.name.toLowerCase().slice(0, 12)))
  );
}

function detectDayIndex(msg: string, days: DayInfo[]): number | null {
  const m = msg.match(/day\s*(\d+)/i);
  if (m) {
    const n = Number(m[1]) - 1;
    if (days.some((d) => d.day_index === n)) return n;
  }
  return null;
}

function parseDayToken(token: string, days: DayInfo[]): number | null {
  if (/^\d+$/.test(token)) {
    const n = Number(token) - 1;
    return days.some((d) => d.day_index === n) ? n : null;
  }
  return null;
}

function busiestDay(input: {
  days: DayInfo[];
  activities: ActivityRow[];
}): number {
  let best = 0;
  let max = -1;
  for (const d of input.days) {
    const c = input.activities.filter((a) => a.day_id === d.id).length;
    if (c > max) {
      max = c;
      best = d.day_index;
    }
  }
  return best;
}

function capitalize(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export { shiftActivityStartTime } from "./scheduler";
