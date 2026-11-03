type OpeningHours = {
  openNow?: boolean;
  periods?: {
    open?: { day?: number; hour?: number; minute?: number };
    close?: { day?: number; hour?: number; minute?: number };
  }[];
  weekdayDescriptions?: string[];
};

function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function dayOfWeek(date: Date): number {
  return date.getDay();
}

export function checkVisitAgainstHours(input: {
  openingHours: unknown;
  visitStartTime: string;
  durationMinutes: number;
  dayDate: Date;
}): { ok: boolean; warning?: string } {
  const oh = input.openingHours as OpeningHours | undefined;
  if (!oh?.periods?.length) {
    return { ok: true, warning: "Opening hours unverified" };
  }

  const startMin = parseTime(input.visitStartTime);
  const endMin = startMin + input.durationMinutes;
  const dow = dayOfWeek(input.dayDate);

  for (const period of oh.periods) {
    if (period.open?.day !== dow) continue;
    const openMin =
      (period.open.hour ?? 0) * 60 + (period.open.minute ?? 0);
    const closeMin = period.close
      ? (period.close.hour ?? 24) * 60 + (period.close.minute ?? 0)
      : 24 * 60;
    if (startMin >= openMin && endMin <= closeMin) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    warning: "Scheduled outside verified opening hours",
  };
}
