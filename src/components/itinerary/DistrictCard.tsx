"use client";

import { useEffect, useState } from "react";

type Spot = {
  id: string;
  name: string;
  category: string;
  why: string;
};

export function DistrictCard({
  name,
  lat,
  lng,
  interests,
  onClose,
}: {
  name: string;
  lat: number;
  lng: number;
  interests: string[];
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [spotsReady, setSpotsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const interestKey = interests.join(",");

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setThumbnailUrl(null);
    setSpots([]);
    setNotice(null);
    setSpotsReady(false);
    setError(null);
    const spotParams = new URLSearchParams({
      name,
      lat: String(lat),
      lng: String(lng),
    });
    if (interests.length) spotParams.set("interests", interests.join(","));
    void Promise.all([
      fetch(`/api/places/city?name=${encodeURIComponent(name)}`).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load city");
        return data as { summary?: string; thumbnailUrl?: string | null };
      }),
      fetch(`/api/places/district-spots?${spotParams}`).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load places");
        return data as { spots?: Spot[]; notice?: string };
      }),
    ])
      .then(([city, picked]) => {
        if (cancelled) return;
        setSummary(city.summary ?? null);
        setThumbnailUrl(city.thumbnailUrl ?? null);
        setSpots(picked.spots ?? []);
        setNotice(picked.notice ?? null);
        setSpotsReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this area");
      });
    return () => {
      cancelled = true;
    };
  }, [name, lat, lng, interestKey]);

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-[500] max-h-[78%] overflow-y-auto rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_12px_40px_rgba(8,11,58,0.2)]">
      <div className="h-28 bg-[#080B3A]">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end px-3 py-3 text-lg font-semibold text-white">{name}</div>
        )}
      </div>
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#080B3A]">{name}</h3>
          <button type="button" className="text-xs text-[#6B7280]" onClick={onClose}>
            Close
          </button>
        </div>
        {!summary && !error ? <p className="text-sm text-[#6B7280]">Loading area…</p> : null}
        {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
        {summary ? <p className="text-sm leading-relaxed text-[#1F2937]">{summary}</p> : null}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Spots for this trip
          </p>
          {spots.length ? (
            <ul className="mt-2 space-y-2">
              {spots.map((spot) => (
                <li key={spot.id}>
                  <p className="text-sm font-semibold text-[#080B3A]">{spot.name}</p>
                  <p className="text-xs capitalize text-[#6B7280]">{spot.category}</p>
                  <p className="text-sm leading-relaxed text-[#1F2937]">{spot.why}</p>
                </li>
              ))}
            </ul>
          ) : spotsReady ? null : summary ? (
            <p className="mt-1 text-sm text-[#6B7280]">Looking for places that match this trip…</p>
          ) : null}
          {notice ? <p className="mt-2 text-[11px] leading-relaxed text-[#6B7280]">{notice}</p> : null}
        </div>
      </div>
    </div>
  );
}
