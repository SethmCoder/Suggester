"use client";

import { useEffect, useState } from "react";

export function StopBlurb({
  name,
  address,
  lat,
  lng,
  planningNote,
}: {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  planningNote?: string | null;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [paragraph, setParagraph] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      name,
      lat: String(lat),
      lng: String(lng),
    });
    if (address) params.set("address", address);
    void fetch(`/api/places/card?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load place");
        return data as { thumbnailUrl: string | null; paragraph: string | null };
      })
      .then((data) => {
        if (cancelled) return;
        setThumbnailUrl(data.thumbnailUrl);
        setParagraph(data.paragraph);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [name, address, lat, lng]);

  const description =
    paragraph ||
    (loaded ? "No reference description for this stop." : "Loading description…");
  const note =
    planningNote && paragraph && !paragraph.includes(planningNote) ? planningNote : null;

  return (
    <div className="mt-2">
      <div className="flex gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#080B3A] text-lg font-semibold text-white">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 1)
          )}
        </div>
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-[#1F2937]">{description}</p>
      </div>
      {note ? <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">{note}</p> : null}
      {!paragraph && loaded && planningNote ? (
        <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">{planningNote}</p>
      ) : null}
    </div>
  );
}
