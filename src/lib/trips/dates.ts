/** Calendar helpers for trip start/end and overnight stays. Invent nothing about bookings. */

const DAY_MS = 86_400_000;

/** Parse YYYY-MM-DD as a local calendar date at noon to avoid DST edge flips. */
export function parseTripDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
    return d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

export function formatTripDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Overnight stays between arrival and departure (Jun 8–13 → 5 nights). */
export function nightsBetween(startDate: string, endDate: string): number {
  const start = parseTripDate(startDate);
  const end = parseTripDate(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return Math.max(0, diff);
}

/** Inclusive calendar days on the trip (Jun 8–13 → 6 days). */
export function calendarDaysInclusive(startDate: string, endDate: string): number {
  return nightsBetween(startDate, endDate) + 1;
}

export function assertValidDateRange(startDate: string, endDate: string): void {
  const start = parseTripDate(startDate);
  const end = parseTripDate(endDate);
  if (end.getTime() < start.getTime()) {
    throw new Error("End date must be on or after the start date.");
  }
}

export function addCalendarDays(startDate: string, daysToAdd: number): string {
  const d = parseTripDate(startDate);
  d.setDate(d.getDate() + daysToAdd);
  return formatTripDate(d);
}

export function nightsLabel(nights: number): string {
  return nights === 1 ? "1 night" : `${nights} nights`;
}
