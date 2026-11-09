import { addCalendarDays, nightsBetween } from "@/lib/trips/dates";
import { materializeDatesFromBooking } from "./suggestions";
import type { ParsedBooking } from "./types";

export function datesFromDreamAndBooking(input: {
  booking: ParsedBooking;
  potentialStart?: string | null;
  potentialEnd?: string | null;
  estimatedDurationDays?: number | null;
}): { startDate: string; endDate: string; nights: number } {
  const stayDays = Math.max(
    1,
    input.estimatedDurationDays ??
      (input.potentialStart && input.potentialEnd
        ? nightsBetween(input.potentialStart, input.potentialEnd) + 1
        : 3),
  );

  if (input.booking.startDate) {
    return materializeDatesFromBooking({
      flightDate: input.booking.startDate,
      stayDays,
    });
  }

  if (input.potentialStart && input.potentialEnd) {
    return {
      startDate: input.potentialStart,
      endDate: input.potentialEnd,
      nights: nightsBetween(input.potentialStart, input.potentialEnd),
    };
  }

  const startDate =
    input.potentialStart ??
    addCalendarDays(new Date().toISOString().slice(0, 10), 30);
  const endDate = addCalendarDays(startDate, stayDays - 1);
  return {
    startDate,
    endDate,
    nights: nightsBetween(startDate, endDate),
  };
}
