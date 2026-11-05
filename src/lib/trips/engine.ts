import type { PatchOp } from "@/lib/ai/patch";

/** A stop the engine can score without calling a model. */
export type EngineStop = {
  id: string;
  name: string;
  start: string;
  durationMinutes: number;
  travelMinutesFromPrev: number | null;
  lat: number | null;
  lng: number | null;
  openingHours: string | null;
  priority?: string | null;
  sortOrder: number;
};

export type FindingSeverity = "critical" | "recommended" | "optional";

export type Finding = {
  severity: FindingSeverity;
  code: string;
  activityIds: string[];
  explanation: string;
  why: string;
  suggestion: string;
};

export type OptimizeMode = "balanced" | "maximum" | "relaxed";

export type OptimizeProposal = {
  optimized: boolean;
  message: string;
  operations: PatchOp[];
  preview: EngineStop[];
};

const SPEED_KMH = 80;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function clock(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
}

export function daySignature(stops: EngineStop[]): string {
  return stops
    .map(
      (s) =>
        `${s.id}|${s.start}|${s.durationMinutes}|${s.travelMinutesFromPrev ?? ""}|${s.lat ?? ""}|${s.lng ?? ""}|${s.sortOrder}`,
    )
    .join(";");
}

function hourWindow(raw: string | null): { open: number; close: number } | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return {
    open: Number(match[1]) * 60 + Number(match[2]),
    close: Number(match[3]) * 60 + Number(match[4]),
  };
}

export function inspectDay(
  stops: EngineStop[],
  options?: { pace?: "relaxed" | "balanced" | "packed"; dayEnd?: string },
): Finding[] {
  const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const findings: Finding[] = [];
  const dayEnd = minutesOf(options?.dayEnd ?? "21:00");

  for (let i = 0; i < ordered.length; i++) {
    const stop = ordered[i];
    const start = minutesOf(stop.start);
    const end = start + stop.durationMinutes;
    for (let j = i + 1; j < ordered.length; j++) {
      const other = ordered[j];
      const otherStart = minutesOf(other.start);
      const otherEnd = otherStart + other.durationMinutes;
      if (start < otherEnd && otherStart < end) {
        findings.push({
          severity: "critical",
          code: "overlap",
          activityIds: [stop.id, other.id],
          explanation: `${stop.name} and ${other.name} are scheduled at the same time.`,
          why: "A traveler cannot be in two places at once.",
          suggestion: `Move ${other.name} to start at ${clock(end + (other.travelMinutesFromPrev ?? 15))}.`,
        });
      }
    }

    const window = hourWindow(stop.openingHours);
    if (stop.openingHours && window && (start < window.open || end > window.close)) {
      findings.push({
        severity: "critical",
        code: "hours",
        activityIds: [stop.id],
        explanation: `${stop.name} is scheduled outside the stored hours ${stop.openingHours}.`,
        why: "The visit falls outside hours that were saved from the source.",
        suggestion: `Move it to start at ${clock(window.open)}.`,
      });
    }

    if (i > 0 && stop.lat != null && stop.lng != null) {
      const prev = ordered[i - 1];
      if (prev.lat != null && prev.lng != null && stop.travelMinutesFromPrev != null) {
        const km = haversineKm(
          { lat: prev.lat, lng: prev.lng },
          { lat: stop.lat, lng: stop.lng },
        );
        const fastest = (km / SPEED_KMH) * 60;
        if (stop.travelMinutesFromPrev + 1 < fastest) {
          findings.push({
            severity: "critical",
            code: "travel",
            activityIds: [prev.id, stop.id],
            explanation: `${Math.round(km)} km between ${prev.name} and ${stop.name} cannot fit in ${stop.travelMinutesFromPrev} minutes.`,
            why: "The saved travel time is shorter than the distance allows.",
            suggestion: `Allow about ${Math.ceil(fastest)} minutes between them.`,
          });
        }
      }
    }

    if (end > dayEnd + 30) {
      findings.push({
        severity: "critical",
        code: "day-end",
        activityIds: [stop.id],
        explanation: `${stop.name} runs past the end of the day.`,
        why: "The day does not have room for this visit.",
        suggestion: "Move it to another day or shorten it.",
      });
    }
  }

  const pace = options?.pace ?? "balanced";
  const cap = pace === "relaxed" ? 3 : pace === "packed" ? 7 : 5;
  if (ordered.length > cap) {
    findings.push({
      severity: "recommended",
      code: "packed",
      activityIds: ordered.map((s) => s.id),
      explanation: `This day has ${ordered.length} stops for a ${pace} pace.`,
      why: "The day is fuller than the pace the traveler chose.",
      suggestion: "Drop an optional stop or move one to another day.",
    });
  }

  const names = new Map<string, string[]>();
  for (const stop of ordered) {
    const key = stop.name.trim().toLowerCase();
    names.set(key, [...(names.get(key) ?? []), stop.id]);
  }
  for (const [name, ids] of names) {
    if (ids.length > 1) {
      findings.push({
        severity: "recommended",
        code: "repeat",
        activityIds: ids,
        explanation: `${name} appears more than once.`,
        why: "The repeat uses time that could stay free.",
        suggestion: "Keep one visit.",
      });
    }
  }

  return findings;
}

export function scoreIfChanged(
  previousSignature: string | null,
  stops: EngineStop[],
  options?: { pace?: "relaxed" | "balanced" | "packed"; dayEnd?: string },
): { skipped: boolean; signature: string; findings: Finding[] } {
  const signature = daySignature(stops);
  if (previousSignature != null && previousSignature === signature) {
    return { skipped: true, signature, findings: [] };
  }
  return { skipped: false, signature, findings: inspectDay(stops, options) };
}

export type VerificationStatus =
  | "verified"
  | "estimated"
  | "unverified"
  | "unavailable";

export function verificationFor(stop: EngineStop): {
  status: VerificationStatus;
  text: string;
  price: "unavailable";
} {
  if (stop.openingHours && hourWindow(stop.openingHours)) {
    return {
      status: "verified",
      text: `Hours from OpenStreetMap: ${stop.openingHours}.`,
      price: "unavailable",
    };
  }
  if (stop.openingHours) {
    return {
      status: "unverified",
      text: "Hours were stored but could not be read. Hours unknown.",
      price: "unavailable",
    };
  }
  return {
    status: "unverified",
    text: "Hours unknown.",
    price: "unavailable",
  };
}

function cloneStops(stops: EngineStop[]): EngineStop[] {
  return stops.map((s) => ({ ...s }));
}

export function proposeOptimize(
  stops: EngineStop[],
  mode: OptimizeMode,
): OptimizeProposal {
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  if (located.length < 2) {
    return {
      optimized: false,
      message: "This day cannot be optimized because coordinates are missing.",
      operations: [],
      preview: cloneStops(stops),
    };
  }

  const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const anchor = ordered.find((s) => s.lat != null && s.lng != null) ?? ordered[0];
  const remaining = ordered.filter((s) => s.id !== anchor.id);
  const sequence: EngineStop[] = [anchor];
  while (remaining.length) {
    const last = sequence[sequence.length - 1];
    let best = 0;
    let bestKm = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      if (
        last.lat == null ||
        last.lng == null ||
        candidate.lat == null ||
        candidate.lng == null
      ) {
        return;
      }
      const km = haversineKm(
        { lat: last.lat, lng: last.lng },
        { lat: candidate.lat, lng: candidate.lng },
      );
      if (km < bestKm) {
        bestKm = km;
        best = index;
      }
    });
    sequence.push(remaining.splice(best, 1)[0]);
  }

  const cap = mode === "relaxed" ? 3 : mode === "maximum" ? sequence.length : 5;
  const kept: EngineStop[] = [];
  const dropped: EngineStop[] = [];
  for (const stop of sequence) {
    if (kept.length >= cap && stop.priority === "optional") dropped.push(stop);
    else kept.push(stop);
  }

  const operations: PatchOp[] = [];
  kept.forEach((stop, index) => {
    operations.push({
      op: "move",
      activityId: stop.id,
      toDayIndex: 0,
      toSortOrder: index,
    });
  });
  for (const stop of dropped) {
    operations.push({ op: "delete", activityId: stop.id });
  }

  const preview = kept.map((stop, index) => ({ ...stop, sortOrder: index }));
  const moved = kept.some((stop, index) => ordered[index]?.id !== stop.id);
  return {
    optimized: true,
    message: moved
      ? `Proposed a ${mode} order that groups nearer stops. Nothing is saved until you apply it.`
      : `The ${mode} order already groups nearer stops. Nothing is saved until you apply it.`,
    operations,
    preview,
  };
}

export function applyOperations(
  stops: EngineStop[],
  operations: PatchOp[],
): EngineStop[] {
  let next = cloneStops(stops);
  for (const op of operations) {
    if (op.op === "delete") {
      next = next.filter((s) => s.id !== op.activityId);
    } else if (op.op === "move") {
      next = next.map((s) =>
        s.id === op.activityId ? { ...s, sortOrder: op.toSortOrder } : s,
      );
    } else if (op.op === "update" && op.fields.startTime) {
      next = next.map((s) =>
        s.id === op.activityId ? { ...s, start: op.fields.startTime! } : s,
      );
    }
  }
  return next.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** A what-if is an unsaved preview. The input list is never written. */
export function proposeWhatIf(
  stops: EngineStop[],
  change: { removeId?: string; mode?: OptimizeMode },
): OptimizeProposal {
  if (change.removeId) {
    const preview = cloneStops(stops).filter((s) => s.id !== change.removeId);
    return {
      optimized: true,
      message: "Proposed removal. The saved day stays as it is until you apply it.",
      operations: [{ op: "delete", activityId: change.removeId }],
      preview,
    };
  }
  return proposeOptimize(stops, change.mode ?? "balanced");
}
