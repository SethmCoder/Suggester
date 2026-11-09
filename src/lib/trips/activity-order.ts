/** Chronological ordering for itinerary activities. */

export type TimedActivity = {
  start_time?: string | null;
  sort_order?: number;
};

/** Parse HH:MM or HH:MM:SS into minutes from midnight; null if missing/invalid. */
export function startTimeMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/**
 * Sort by scheduled start_time ascending; unscheduled (null) last.
 * Ties keep relative sort_order.
 */
export function sortActivitiesChronologically<T extends TimedActivity>(
  activities: T[],
): T[] {
  return [...activities].sort((a, b) => {
    const am = startTimeMinutes(a.start_time);
    const bm = startTimeMinutes(b.start_time);
    if (am == null && bm == null) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
    if (am == null) return 1;
    if (bm == null) return -1;
    if (am !== bm) return am - bm;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

export function partitionScheduled<T extends TimedActivity>(activities: T[]): {
  scheduled: T[];
  unscheduled: T[];
} {
  const sorted = sortActivitiesChronologically(activities);
  return {
    scheduled: sorted.filter((a) => startTimeMinutes(a.start_time) != null),
    unscheduled: sorted.filter((a) => startTimeMinutes(a.start_time) == null),
  };
}

/** Rewrite sort_order to match chronological order. */
export function reindexByChronology<T extends TimedActivity>(activities: T[]): T[] {
  return sortActivitiesChronologically(activities).map((a, sort_order) => ({
    ...a,
    sort_order,
  }));
}
