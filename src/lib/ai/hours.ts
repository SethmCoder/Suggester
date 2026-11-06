type GooglePeriod = {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
};

type OpeningHours = {
  periods?: GooglePeriod[];
  weekdayDescriptions?: string[];
  osmOpeningHours?: string;
};

export type OpenInterval = { open: number; close: number };

const DAY_INDEX: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

const DAY = "(?:su|mo|tu|we|th|fr|sa)";
const DAY_LIST = `${DAY}(?:-${DAY})?(?:,\\s*${DAY}(?:-${DAY})?)*`;

function clock(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseClock(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toMonday(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function fromMonday(mondayIndex: number): number {
  return (mondayIndex + 1) % 7;
}

function expandDays(spec: string): number[] | null {
  const days = new Set<number>();
  for (const chunk of spec.split(",")) {
    const range = chunk
      .trim()
      .match(/^(su|mo|tu|we|th|fr|sa)(?:-(su|mo|tu|we|th|fr|sa))?$/);
    if (!range) return null;
    const start = toMonday(DAY_INDEX[range[1]]);
    let end = toMonday(DAY_INDEX[range[2] ?? range[1]]);
    if (end < start) end += 7;
    for (let i = start; i <= end; i++) days.add(fromMonday(i % 7));
  }
  return [...days];
}

function pushInterval(
  byDay: Map<number, OpenInterval[]>,
  day: number,
  open: number,
  close: number,
) {
  const list = byDay.get(day) ?? [];
  list.push({ open, close });
  byDay.set(day, list);
}

function addSpan(
  byDay: Map<number, OpenInterval[]>,
  days: number[],
  open: number,
  close: number,
) {
  for (const day of days) {
    if (close > open) pushInterval(byDay, day, open, close);
    else if (close < open) {
      pushInterval(byDay, day, open, 24 * 60);
      pushInterval(byDay, (day + 1) % 7, 0, close);
    }
  }
}

function readTimes(rule: string): OpenInterval[] | null {
  const matches = [
    ...rule.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g),
  ];
  if (!matches.length) return [];
  const spans: OpenInterval[] = [];
  for (const match of matches) {
    const openH = Number(match[1]);
    const openM = Number(match[2]);
    const closeH = Number(match[3]);
    const closeM = Number(match[4]);
    if (
      openH > 23 ||
      closeH > 24 ||
      openM > 59 ||
      closeM > 59 ||
      (closeH === 24 && closeM !== 0)
    ) {
      return null;
    }
    spans.push({ open: openH * 60 + openM, close: closeH * 60 + closeM });
  }
  return spans;
}

/**
 * Read one weekday from an OpenStreetMap opening_hours value.
 * Empty means the source says closed. Null means the value could not be read,
 * so the caller must not treat the place as open or closed.
 */
export function intervalsForOsmHours(
  raw: string,
  date: Date,
): OpenInterval[] | null {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
  if (!text) return null;
  if (/\b(sunrise|sunset|dawn|dusk)\b/.test(text)) return null;
  if (text === "24/7" || text === "00:00-24:00") {
    return [{ open: 0, close: 24 * 60 }];
  }

  const byDay = new Map<number, OpenInterval[]>();
  let understood = false;
  for (const rule of text.split(";").map((part) => part.trim()).filter(Boolean)) {
    if (/^(?:ph|sh)\b/.test(rule)) continue;
    const times = readTimes(rule);
    if (times == null) return null;
    const dayMatch = rule.match(new RegExp(DAY_LIST, "i"));
    const days = dayMatch ? expandDays(dayMatch[0].replace(/\s+/g, "")) : null;
    if (dayMatch && !days) return null;
    const applies = days ?? [0, 1, 2, 3, 4, 5, 6];
    const closed = /\b(?:off|closed)\b/.test(rule);
    const leftover = rule
      .replace(new RegExp(DAY_LIST, "gi"), " ")
      .replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, " ")
      .replace(/\b(?:off|closed|open)\b/g, " ")
      .replace(/[,+]/g, " ")
      .trim();
    if (/[a-z]/i.test(leftover)) return null;
    if (!times.length && !closed) return null;
    understood = true;
    if (closed || !times.length) {
      for (const day of applies) byDay.set(day, []);
      continue;
    }
    for (const day of applies) byDay.set(day, []);
    for (const span of times) addSpan(byDay, applies, span.open, span.close);
  }
  if (!understood) return null;
  return (byDay.get(date.getDay()) ?? []).sort((a, b) => a.open - b.open);
}

function intervalsFromPeriods(
  periods: GooglePeriod[],
  date: Date,
): OpenInterval[] {
  const dow = date.getDay();
  const spans: OpenInterval[] = [];
  for (const period of periods) {
    if (period.open?.day !== dow) continue;
    const open = (period.open.hour ?? 0) * 60 + (period.open.minute ?? 0);
    const close = period.close
      ? (period.close.hour ?? 24) * 60 + (period.close.minute ?? 0)
      : 24 * 60;
    if (close > open) spans.push({ open, close });
    else spans.push({ open, close: 24 * 60 });
  }
  return spans.sort((a, b) => a.open - b.open);
}

export function hoursForDate(
  openingHours: unknown,
  date: Date,
): { intervals: OpenInterval[] | null; source: string } {
  if (typeof openingHours === "string") {
    return {
      intervals: intervalsForOsmHours(openingHours, date),
      source: openingHours,
    };
  }
  const oh = openingHours as OpeningHours | undefined;
  if (typeof oh?.osmOpeningHours === "string") {
    return {
      intervals: intervalsForOsmHours(oh.osmOpeningHours, date),
      source: oh.osmOpeningHours,
    };
  }
  if (oh?.periods?.length) {
    return {
      intervals: intervalsFromPeriods(oh.periods, date),
      source: oh.weekdayDescriptions?.[0] ?? "published hours",
    };
  }
  return { intervals: null, source: "" };
}

export type VisitFit =
  | { status: "unknown" }
  | { status: "closed"; reason: string }
  | { status: "open"; start: string; window: string; source: string; moved: boolean };

/** Place a visit inside published hours. Unknown hours are not treated as open or closed. */
export function fitVisit(input: {
  openingHours: unknown;
  cursor: string;
  durationMinutes: number;
  dayDate: Date;
  dayEnd?: string;
}): VisitFit {
  const { intervals, source } = hoursForDate(input.openingHours, input.dayDate);
  if (!intervals) return { status: "unknown" };
  if (!intervals.length) {
    return {
      status: "closed",
      reason: `Closed that day according to ${source}.`,
    };
  }
  const cursor = parseClock(input.cursor.slice(0, 5));
  const dayEnd = parseClock((input.dayEnd ?? "21:00").slice(0, 5));
  for (const interval of intervals) {
    const start = Math.max(cursor, interval.open);
    const limit = Math.min(interval.close, dayEnd);
    if (start + input.durationMinutes <= limit) {
      return {
        status: "open",
        start: clock(start),
        window: `${clock(interval.open)}-${clock(interval.close === 24 * 60 ? 24 * 60 : interval.close)}`,
        source,
        moved: start !== cursor,
      };
    }
  }
  const listed = intervals
    .map((interval) => `${clock(interval.open)}-${clock(interval.close)}`)
    .join(", ");
  return {
    status: "closed",
    reason: `Open ${listed} (${source}), which does not fit a ${input.durationMinutes} minute visit after ${input.cursor.slice(0, 5)}.`,
  };
}

export function checkVisitAgainstHours(input: {
  openingHours: unknown;
  visitStartTime: string;
  durationMinutes: number;
  dayDate: Date;
}): { ok: boolean; warning?: string } {
  const fit = fitVisit({
    openingHours: input.openingHours,
    cursor: input.visitStartTime,
    durationMinutes: input.durationMinutes,
    dayDate: input.dayDate,
  });
  if (fit.status === "unknown") {
    return { ok: true, warning: "Opening hours unverified" };
  }
  if (fit.status === "closed" || fit.moved) {
    return {
      ok: false,
      warning:
        fit.status === "closed"
          ? fit.reason
          : `Scheduled outside published hours ${fit.source}`,
    };
  }
  return { ok: true };
}
