import type { LockedTimedStopInput } from "@/components/itinerary/LockedTimedStopForm";
import type { CalendarNewStop } from "@/components/itinerary/WeekCalendarView";

function normalizeClock(value: string): string {
  const parts = value.trim().split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "09:00:00";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function durationFromClock(start: string, end: string): number {
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 60;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return Math.max(15, diff || 60);
}

export function calendarStopFromLockedInput(
  dayIndex: number,
  input: LockedTimedStopInput,
): CalendarNewStop {
  const startTime = normalizeClock(input.startTime);
  const endTime = normalizeClock(input.endTime);
  if (input.stopKind === "meeting") {
    return {
      dayIndex,
      stopKind: "meeting",
      name: input.title.trim() || "Meeting",
      startTime,
      endTime,
      durationMinutes: durationFromClock(startTime, endTime),
      note: "User-locked meeting",
      place_id: "user:meeting",
    };
  }
  if (input.stopKind === "attraction") {
    const name = input.title.trim() || "Park day";
    return {
      dayIndex,
      stopKind: "attraction",
      name,
      startTime,
      endTime,
      durationMinutes: durationFromClock(startTime, endTime),
      note: "User-locked park / attraction day · confirm published hours",
      place_id: `user:attraction:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    };
  }
  const from = input.transportFrom?.trim() || "A";
  const to = input.transportTo?.trim() || "B";
  const title = input.title.trim() || `Transport · ${from} → ${to}`;
  return {
    dayIndex,
    stopKind: "transport",
    name: title,
    startTime,
    endTime,
    durationMinutes: durationFromClock(startTime, endTime),
    address: `${from} → ${to}`,
    note: `User-locked transport · ${from} → ${to}`,
    place_id: `user:transport:${from}:${to}`,
    transportFrom: from,
    transportTo: to,
  };
}
