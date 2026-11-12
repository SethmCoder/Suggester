"use client";

import { useEffect, useState } from "react";
import type { DreamerStayAdvise } from "@/lib/dreamer/types";

export type StoredStayAdvise = DreamerStayAdvise & {
  suggestedDays?: number | null;
};

const STORAGE_PREFIX = "waypoint:stay-advise:";

export function StayAdviseBanner({ tripId }: { tripId: string }) {
  const [payload, setPayload] = useState<StoredStayAdvise | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${tripId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredStayAdvise;
      if (parsed?.rationale || parsed?.stayUntil || parsed?.suggestedDays != null) {
        setPayload(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [tripId]);

  function dismiss() {
    try {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${tripId}`);
    } catch {
      /* ignore */
    }
    setPayload(null);
  }

  if (!payload) return null;

  return (
    <div
      role="status"
      className="rounded-[14px] border border-[#E1E5F0] bg-[#F5F7FF] px-4 py-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0400FF]">
            Stay advice
          </p>
          {payload.rationale ? (
            <p className="mt-1.5 text-sm leading-relaxed text-[#080B3A]">
              {payload.rationale}
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-[#6B7280]">
            {payload.stayUntil ? (
              <>
                Suggested until{" "}
                <span className="font-semibold text-[#080B3A]">
                  {payload.stayUntil}
                </span>
              </>
            ) : null}
            {payload.suggestedDays != null && payload.suggestedDays > 0 ? (
              <>
                {payload.stayUntil ? " · " : ""}
                About{" "}
                <span className="font-semibold text-[#080B3A]">
                  {payload.suggestedDays} day
                  {payload.suggestedDays === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-xs font-semibold text-[#6B7280] hover:text-[#080B3A]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
