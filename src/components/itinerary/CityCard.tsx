"use client";

import { useEffect, useState } from "react";

type CityBrief = {
  name: string;
  summary: string;
  thumbnailUrl: string | null;
  population: number | null;
  countryCode: string | null;
};

export function CityCard({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<CityBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBrief(null);
    setError(null);
    void fetch(`/api/places/city?name=${encodeURIComponent(name)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load city");
        return data as CityBrief;
      })
      .then((data) => {
        if (!cancelled) setBrief(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load city");
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_8px_24px_rgba(8,11,58,0.08)]">
      <div className="h-36 bg-[#080B3A]">
        {brief?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brief.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end px-4 py-3 text-lg font-semibold text-white">
            {name}
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-[#080B3A]">{brief?.name || name}</h3>
          <button type="button" className="text-xs text-[#6B7280]" onClick={onClose}>
            Close
          </button>
        </div>
        {!brief && !error ? <p className="text-sm text-[#6B7280]">Loading city…</p> : null}
        {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
        {brief ? <p className="text-sm leading-relaxed text-[#1F2937]">{brief.summary}</p> : null}
      </div>
    </div>
  );
}
