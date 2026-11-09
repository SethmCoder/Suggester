/** Calendar helpers for trip start/end and overnight stays. Invent nothing about bookings. */

const DAY_MS = 86_400_000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** Parse YYYY-MM-DD as a local calendar date at noon to avoid DST edge flips. */
export function parseTripDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
    return d;
  }
  const year = Number(m[1]);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`Year must be between ${MIN_YEAR} and ${MAX_YEAR}.`);
  }
  return new Date(year, Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

export function formatTripDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * Accept only real YYYY-MM-DD travel dates. Rejects empty, partial, or absurd years
 * (e.g. Safari date widgets stuck on 3726).
 */
export function sanitizeTripDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  try {
    const parsed = parseTripDate(value.trim());
    return formatTripDate(parsed);
  } catch {
    return "";
  }
}

export function defaultTripStart(daysFromNow = 30): string {
  return addCalendarDays(formatTripDate(new Date()), daysFromNow);
}

export function defaultTripEnd(startDate: string, nights = 4): string {
  const start = sanitizeTripDate(startDate) || defaultTripStart();
  return addCalendarDays(start, Math.max(1, nights));
}

/** HTML date min/max for pickers so the year wheel stays usable. */
export function tripDateInputBounds(today = new Date()): {
  min: string;
  max: string;
} {
  const y = today.getFullYear();
  return {
    min: `${Math.max(MIN_YEAR, y - 1)}-01-01`,
    max: `${Math.min(MAX_YEAR, y + 5)}-12-31`,
  };
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
  const start = sanitizeTripDate(startDate);
  const end = sanitizeTripDate(endDate);
  if (!start || !end) {
    throw new Error("Choose a valid arrival and departure date.");
  }
  if (parseTripDate(end).getTime() < parseTripDate(start).getTime()) {
    throw new Error("End date must be on or after the start date.");
  }
}

export function addCalendarDays(startDate: string, daysToAdd: number): string {
  const d = parseTripDate(startDate);
  if (!Number.isFinite(daysToAdd)) {
    throw new Error("Invalid day offset");
  }
  // Cap runaway offsets that would produce absurd years.
  const capped = Math.max(-3650, Math.min(3650, Math.trunc(daysToAdd)));
  d.setDate(d.getDate() + capped);
  return formatTripDate(d);
}

export function nightsLabel(nights: number): string {
  return nights === 1 ? "1 night" : `${nights} nights`;
}
