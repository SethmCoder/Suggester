import { describe, expect, it } from "vitest";
import { PLAN_COOKIE } from "@/lib/billing/plans";
import {
  ENTITLEMENT_COOKIE,
  FREE_AI_LIMIT,
  gateFeature,
  isProEntitled,
} from "@/lib/billing/entitlements";
import {
  applyOperations,
  inspectDay,
  proposeOptimize,
  proposeWhatIf,
  scoreIfChanged,
  verificationFor,
  type EngineStop,
} from "@/lib/trips/engine";

function stop(patch: Partial<EngineStop> & Pick<EngineStop, "id" | "name">): EngineStop {
  return {
    start: "10:00",
    durationMinutes: 60,
    travelMinutesFromPrev: null,
    lat: null,
    lng: null,
    openingHours: null,
    priority: "preferred",
    sortOrder: 0,
    ...patch,
  };
}

describe("trip engine", () => {
  it("flags overlaps and impossible travel, and does not invent hours", () => {
    const findings = inspectDay([
      stop({ id: "a", name: "Museum", start: "10:00", durationMinutes: 90, sortOrder: 0, lat: 48.86, lng: 2.34 }),
      stop({
        id: "b",
        name: "Tower",
        start: "10:30",
        durationMinutes: 60,
        sortOrder: 1,
        lat: 48.86,
        lng: 2.35,
        travelMinutesFromPrev: 10,
      }),
      stop({
        id: "c",
        name: "Garden",
        start: "15:00",
        durationMinutes: 60,
        sortOrder: 2,
        lat: 41.9,
        lng: 12.5,
        travelMinutesFromPrev: 20,
      }),
    ]);
    expect(findings.some((f) => f.code === "overlap" && f.severity === "critical")).toBe(true);
    expect(findings.some((f) => f.code === "travel" && f.severity === "critical")).toBe(true);
    const hours = verificationFor(stop({ id: "a", name: "Museum" }));
    expect(hours.text.toLowerCase()).toContain("hours unknown");
    expect(hours.text.toLowerCase()).not.toMatch(/\bopen\b/);
    expect(hours.text.toLowerCase()).not.toMatch(/\bclosed\b/);
    expect(hours.price).toBe("unavailable");
  });

  it("skips a rescore until a start time changes", () => {
    const day = [
      stop({ id: "a", name: "Museum", sortOrder: 0, lat: 48.86, lng: 2.34 }),
      stop({ id: "b", name: "Cafe", start: "12:00", sortOrder: 1, lat: 48.861, lng: 2.341, travelMinutesFromPrev: 15 }),
    ];
    const first = scoreIfChanged(null, day);
    expect(first.skipped).toBe(false);
    const again = scoreIfChanged(first.signature, day);
    expect(again.skipped).toBe(true);
    expect(again.findings).toEqual([]);
    const moved = day.map((s) => (s.id === "b" ? { ...s, start: "13:00" } : s));
    const third = scoreIfChanged(first.signature, moved);
    expect(third.skipped).toBe(false);
  });

  it("refuses Pro features for a Free caller and ignores the old plan cookie", () => {
    const free = () => undefined;
    expect(gateFeature("generate", free).allowed).toBe(true);
    for (const feature of ["quality", "optimize", "import", "whatif"] as const) {
      expect(gateFeature(feature, free).allowed).toBe(false);
    }
    let used = 0;
    for (let i = 0; i < FREE_AI_LIMIT; i++) {
      const gate = gateFeature("basic", (name) =>
        name === "waypoint_ai_used" ? String(used) : name === "waypoint_ai_month" ? "2026-11" : undefined,
        new Date("2026-11-05T12:00:00Z"),
      );
      expect(gate.allowed).toBe(true);
      used += 1;
    }
    const sixth = gateFeature("basic", (name) =>
      name === "waypoint_ai_used"
        ? String(FREE_AI_LIMIT)
        : name === "waypoint_ai_month"
          ? "2026-11"
          : undefined,
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(sixth.allowed).toBe(false);
    const legacy = (name: string) => (name === PLAN_COOKIE ? "pro" : undefined);
    expect(isProEntitled(legacy)).toBe(false);
    // Legacy plan cookie alone is not Pro, but Free may still generate.
    expect(gateFeature("generate", legacy).allowed).toBe(true);
    const granted = (name: string) => (name === ENTITLEMENT_COOKIE ? "pro" : undefined);
    expect(gateFeature("generate", granted).allowed).toBe(true);
  });

  it("keeps the saved day intact until a proposal is applied", () => {
    const saved = [
      stop({ id: "a", name: "Museum", sortOrder: 0, lat: 48.86, lng: 2.34 }),
      stop({ id: "b", name: "Far", sortOrder: 1, lat: 48.9, lng: 2.4, travelMinutesFromPrev: 40 }),
      stop({ id: "c", name: "Near", sortOrder: 2, lat: 48.8604, lng: 2.3404, travelMinutesFromPrev: 10, priority: "optional" }),
    ];
    const snapshot = saved.map((s) => ({ ...s }));
    const whatIf = proposeWhatIf(saved, { removeId: "b" });
    const optimized = proposeOptimize(saved, "balanced");
    expect(saved).toEqual(snapshot);
    expect(whatIf.preview.find((s) => s.id === "b")).toBeUndefined();
    const discarded = saved.map((s) => ({ ...s }));
    expect(discarded).toEqual(snapshot);
    const applied = applyOperations(saved, whatIf.operations);
    expect(saved).toEqual(snapshot);
    expect(applied.find((s) => s.id === "b")).toBeUndefined();
    expect(optimized.preview.length).toBeGreaterThan(0);
  });

  it("refuses to call a day optimized when coordinates are missing", () => {
    const missing = proposeOptimize(
      [
        stop({ id: "a", name: "Museum" }),
        stop({ id: "b", name: "Cafe", start: "12:00", sortOrder: 1 }),
      ],
      "balanced",
    );
    expect(missing.optimized).toBe(false);
    expect(missing.message.toLowerCase()).toContain("cannot be optimized");
    expect(missing.message.toLowerCase()).not.toContain("improved");
    expect(missing.operations).toEqual([]);

    const located = proposeOptimize(
      [
        stop({ id: "a", name: "Anchor", sortOrder: 0, lat: 48.86, lng: 2.34 }),
        stop({ id: "b", name: "Far", sortOrder: 1, lat: 48.95, lng: 2.5 }),
        stop({ id: "c", name: "Near", sortOrder: 2, lat: 48.8605, lng: 2.3405 }),
      ],
      "maximum",
    );
    expect(located.optimized).toBe(true);
    expect(located.preview.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });
});
