"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const STORAGE_KEY = "waypoint:tour-dismissed-v1";

const STEPS = [
  {
    title: "Plan trips your way",
    body: "Create a trip with destination, dates, and interests. Waypoint builds a day-by-day itinerary you can edit.",
  },
  {
    title: "Places from OpenStreetMap",
    body: "Candidates come from OpenStreetMap (free, no account). Map data © OpenStreetMap contributors (ODbL).",
  },
  {
    title: "Online interest signals",
    body: "When a place has a verified Wikipedia article, recent pageview changes may show as “Online interest increasing” — a weak signal, not proof of foot traffic or social virality.",
  },
  {
    title: "Ask the itinerary maker",
    body: "Delayed flight? Swap a stop? Open any trip and use the assistant to reshuffle activities, then approve changes.",
  },
];

export function FirstRunTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#080B3A]/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div className="w-full max-w-md rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_16px_48px_rgba(8,11,58,0.2)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0400FF]">
          Waypoint tutorial · {step + 1}/{STEPS.length}
        </p>
        <h2
          id="tour-title"
          className="mt-2 text-[20px] font-semibold text-[#080B3A]"
        >
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
          {current.body}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm text-[#6B7280] hover:text-[#080B3A]"
            onClick={dismiss}
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <>
                <Link
                  href="/help"
                  className="inline-flex items-center rounded-[12px] border border-[#E1E5F0] px-4 py-2 text-sm font-medium text-[#080B3A] hover:bg-[#F5F7FF]"
                  onClick={dismiss}
                >
                  Full guide
                </Link>
                <Button type="button" onClick={dismiss}>
                  Got it
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
