"use client";

import { Button } from "@/components/ui/Button";
import type { DreamerStayAdvise } from "@/lib/dreamer/types";

export type StaySuggestPayload = DreamerStayAdvise & {
  suggestedDays?: number | null;
  destination?: string | null;
};

export function StaySuggestModal({
  open,
  payload,
  busy,
  onConfirm,
  onSkip,
}: {
  open: boolean;
  payload: StaySuggestPayload | null;
  busy?: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  if (!open || !payload) return null;

  const days =
    payload.suggestedDays != null && payload.suggestedDays > 0
      ? payload.suggestedDays
      : null;
  const city = payload.destination?.trim() || "this city";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#080B3A]/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={onSkip}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stay-suggest-title"
        className="w-full max-w-md overflow-hidden rounded-[18px] border border-[#E1E5F0] bg-white shadow-[0_24px_64px_rgba(8,11,58,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#E1E5F0] bg-[#F5F7FF] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0400FF]">
            Stay suggestion
          </p>
          <h2
            id="stay-suggest-title"
            className="mt-1.5 text-xl font-semibold tracking-tight text-[#080B3A]"
          >
            {days != null
              ? `About ${days} day${days === 1 ? "" : "s"} in ${city}`
              : `How long to stay in ${city}`}
          </h2>
        </div>
        <div className="space-y-4 px-5 py-5">
          {payload.rationale ? (
            <p className="text-sm leading-relaxed text-[#374151]">
              {payload.rationale}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-[#6B7280]">
              Based on your booking dates, we sketched a stay length. You can
              change days anytime on the itinerary.
            </p>
          )}
          <dl className="grid gap-2 rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] px-3.5 py-3 text-sm">
            {days != null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B7280]">Suggested length</dt>
                <dd className="font-semibold text-[#080B3A]">
                  {days} day{days === 1 ? "" : "s"}
                </dd>
              </div>
            ) : null}
            {payload.stayUntil ? (
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B7280]">Stay through</dt>
                <dd className="font-semibold text-[#080B3A]">
                  {payload.stayUntil}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "Opening…" : "Open itinerary"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={onSkip}
            >
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
