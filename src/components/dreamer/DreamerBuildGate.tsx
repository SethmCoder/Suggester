"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";
import { addCalendarDays, nightsBetween } from "@/lib/trips/dates";
import { titleCasePlace } from "@/lib/dreamer/bookings-store";

export type DreamerBuildAnswers = {
  startDate: string;
  endDate: string;
  estimatedDurationDays: number;
  vibe: "local" | "sights" | "mix";
  intensity: "relaxed" | "balanced" | "packed";
  prefersHiddenGems: boolean;
  idealTripNote: string;
};

const VIBE_OPTIONS: {
  id: DreamerBuildAnswers["vibe"];
  label: string;
  hint: string;
}[] = [
  {
    id: "local",
    label: "Local places",
    hint: "Neighborhood spots, markets, and quiet finds — not the postcard circuit.",
  },
  {
    id: "sights",
    label: "Touristy highlights",
    hint: "Well-known landmarks and classic must-sees you will recognize.",
  },
  {
    id: "mix",
    label: "A mix",
    hint: "A few famous stops, then local food and walks around them.",
  },
];

const PACE_OPTIONS: {
  id: DreamerBuildAnswers["intensity"];
  label: string;
}[] = [
  { id: "relaxed", label: "Relaxed days" },
  { id: "balanced", label: "Balanced" },
  { id: "packed", label: "Full days" },
];

function vibeNote(vibe: DreamerBuildAnswers["vibe"]): string {
  if (vibe === "local") {
    return "Dream: small local places, not tourist traps. Prefer neighborhood and lesser-known spots over famous landmarks.";
  }
  if (vibe === "sights") {
    return "Dream: the well-known sights and classic tourist highlights travelers recognize.";
  }
  return "Dream: a mix of walking, food, and highlights — some famous, some local.";
}

export function DreamerBuildGate({
  open,
  destination,
  initialStart,
  initialEnd,
  initialDays,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  destination: string;
  initialStart?: string | null;
  initialEnd?: string | null;
  initialDays?: number | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (answers: DreamerBuildAnswers) => void;
}) {
  const city = titleCasePlace(destination.split(/→|,/)[0]?.trim() || destination);
  const [step, setStep] = useState<1 | 2>(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [vibe, setVibe] = useState<DreamerBuildAnswers["vibe"] | "">("");
  const [intensity, setIntensity] =
    useState<DreamerBuildAnswers["intensity"]>("balanced");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setVibe("");
    setIntensity("balanced");
    const start =
      initialStart ||
      addCalendarDays(new Date().toISOString().slice(0, 10), 30);
    let end = initialEnd || "";
    if (!end) {
      const days = Math.max(1, initialDays ?? 3);
      end = addCalendarDays(start, days - 1);
    }
    setStartDate(start);
    setEndDate(end);
  }, [open, initialStart, initialEnd, initialDays]);

  const nights = useMemo(() => {
    try {
      if (!startDate || !endDate) return 0;
      return Math.max(0, nightsBetween(startDate, endDate));
    } catch {
      return 0;
    }
  }, [startDate, endDate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#080B3A]/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dreamer-build-title"
        className="w-full max-w-md overflow-hidden rounded-[18px] border border-[#E1E5F0] bg-white shadow-[0_24px_64px_rgba(8,11,58,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#E1E5F0] bg-[#F5F7FF] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0400FF]">
            Before we build
          </p>
          <h2
            id="dreamer-build-title"
            className="mt-1.5 text-xl font-semibold tracking-tight text-[#080B3A]"
          >
            {step === 1
              ? `When are you in ${city}?`
              : `What should ${city} feel like?`}
          </h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Step {step} of 2 — then we open your itinerary.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          {step === 1 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="build-start">Arrive</Label>
                  <input
                    id="build-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStartDate(next);
                      if (endDate && next > endDate) setEndDate(next);
                    }}
                    className="mt-1.5 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm text-[#080B3A]"
                  />
                </div>
                <div>
                  <Label htmlFor="build-end">Leave</Label>
                  <input
                    id="build-end"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1.5 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm text-[#080B3A]"
                  />
                </div>
              </div>
              <p className="text-sm text-[#6B7280]">
                {nights + 1} day{nights === 0 ? "" : "s"} · {nights} night
                {nights === 1 ? "" : "s"}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!startDate || !endDate || endDate < startDate}
                  onClick={() => setStep(2)}
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#080B3A]">
                  Touristy highlights or local places?
                </p>
                {VIBE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVibe(opt.id)}
                    className={`w-full rounded-[12px] border px-3.5 py-3 text-left transition ${
                      vibe === opt.id
                        ? "border-[#0400FF] bg-[#F5F7FF]"
                        : "border-[#E1E5F0] hover:border-[#0400FF]/35"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#080B3A]">
                      {opt.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
                      {opt.hint}
                    </p>
                  </button>
                ))}
              </div>
              <div>
                <p className="text-sm font-medium text-[#080B3A]">Day pace</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PACE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIntensity(opt.id)}
                      className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold transition ${
                        intensity === opt.id
                          ? "bg-[#0400FF] text-white"
                          : "bg-[#F5F7FF] text-[#6B7280] hover:text-[#080B3A]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!vibe || busy}
                  onClick={() => {
                    if (!vibe || !startDate || !endDate) return;
                    onConfirm({
                      startDate,
                      endDate,
                      estimatedDurationDays: nights + 1,
                      vibe,
                      intensity,
                      prefersHiddenGems: vibe === "local",
                      idealTripNote: vibeNote(vibe),
                    });
                  }}
                >
                  {busy ? "Building…" : "Build itinerary"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={busy}
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
