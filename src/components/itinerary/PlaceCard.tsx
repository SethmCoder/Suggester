"use client";

import { useEffect, useState } from "react";
import type { PlaceBrief } from "@/lib/places/place-brief";
import { savePlace } from "@/lib/places/saved-places";

export type SelectedPlace = {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  activityId?: string;
  dayIndex?: number;
};

const TABS = [
  { id: "description", label: "Description" },
  { id: "book", label: "Book" },
  { id: "reviews", label: "Reviews" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PlaceCard({
  place,
  onClose,
  onAdd,
}: {
  place: SelectedPlace;
  onClose: () => void;
  /** Present when this place is not already a stop on the day. */
  onAdd?: () => void;
}) {
  const [tab, setTab] = useState<TabId>("description");
  const [brief, setBrief] = useState<PlaceBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBrief(null);
    setError(null);
    setTab("description");
    const params = new URLSearchParams({
      name: place.name,
      lat: String(place.lat),
      lng: String(place.lng),
    });
    if (place.address) params.set("address", place.address);
    void fetch(`/api/places/brief?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load place");
        return data as PlaceBrief;
      })
      .then((data) => {
        if (!cancelled) setBrief(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load place");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [place.name, place.lat, place.lng, place.address]);

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-[500] max-h-[70%] overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_12px_40px_rgba(8,11,58,0.2)]">
      <div className="flex gap-3 border-b border-[#E1E5F0] p-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-[#F5F7FF]">
          {brief?.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brief.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[#0400FF]">
              {place.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug text-[#080B3A]">
              {place.name}
            </p>
            <button
              type="button"
              className="text-xs text-[#6B7280]"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          {place.address ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-[#6B7280]">
              {place.address}
            </p>
          ) : null}
          {onAdd ? (
            <button
              type="button"
              className="mt-1.5 text-xs font-semibold text-[#0400FF]"
              onClick={onAdd}
            >
              Add to this day
            </button>
          ) : (
            <p className="mt-1.5 text-[11px] text-[#6B7280]">On this day</p>
          )}
          <button
            type="button"
            className="mt-1 block text-xs font-semibold text-[#0400FF]"
            onClick={() =>
              savePlace({
                name: place.name,
                lat: place.lat,
                lng: place.lng,
                address: place.address ?? null,
              })
            }
          >
            Save place
          </button>
        </div>
      </div>
      <div className="flex border-b border-[#E1E5F0] text-xs font-semibold">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`flex-1 px-2 py-2 ${
              tab === item.id
                ? "border-b-2 border-[#0400FF] text-[#0400FF]"
                : "text-[#6B7280]"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="max-h-48 overflow-auto px-3 py-2.5 text-sm text-[#1F2937]">
        {!brief && !error ? (
          <p className="text-xs text-[#6B7280]">Loading place…</p>
        ) : null}
        {error ? <p className="text-xs text-[#DC2626]">{error}</p> : null}
        {brief && tab === "description" ? (
          <div className="space-y-2">
            <p className="text-[13px] leading-relaxed">{brief.paragraph}</p>
          </div>
        ) : null}
        {brief && tab === "book" ? (
          <ul className="space-y-2">
            {brief.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-medium text-[#0400FF] underline"
                >
                  {link.label}
                </a>
                {link.kind === "tickets" ? (
                  <p className="text-[11px] text-[#6B7280]">
                    Opens a search. This is not a reservation.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {brief && tab === "reviews" ? (
          <div className="space-y-2">
            <p className="text-[11px] text-[#6B7280]">{brief.reviewsNote}</p>
            {brief.reviews.length ? (
              <ul className="space-y-2">
                {brief.reviews.map((review, i) => (
                  <li
                    key={`${review.author}-${i}`}
                    className="rounded-[10px] bg-[#F5F7FF] px-2.5 py-2"
                  >
                    <p className="text-[11px] font-semibold text-[#080B3A]">
                      {review.author}
                      {review.rating != null ? ` · ${review.rating}/5` : ""}
                      <span className="font-normal text-[#6B7280]">
                        {" "}
                        · Guest review
                      </span>
                    </p>
                    {review.title ? (
                      <p className="mt-0.5 text-[12px] font-medium text-[#080B3A]">
                        {review.title}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[12px] leading-snug">
                      {review.text}
                    </p>
                  </li>
                ))}
              </ul>
            ) : brief.reviewsKind === "hotelrec" ? null : (
              <p className="text-[13px] text-[#080B3A]">
                Nothing to show yet. Check the maps link on Book if you want
                to read reviews elsewhere.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AddStopSearch({
  near,
  onPick,
}: {
  near?: { lat: number; lng: number } | null;
  onPick: (place: {
    name: string;
    lat: number;
    lng: number;
    address: string;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; address: string; lat: number; lng: number }[]
  >([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (near) {
        params.set("lat", String(near.lat));
        params.set("lng", String(near.lng));
      }
      void fetch(`/api/places/search?${params}`)
        .then((res) => res.json())
        .then((data) => setResults(data.results ?? []))
        .catch(() => setResults([]));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, near]);

  return (
    <div className="relative mt-2 border-t border-[#E1E5F0] pt-2">
      <label className="block text-[11px] font-medium text-[#080B3A]">
        Add a stop
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place to add"
          className="mt-1 w-full rounded-lg border border-[#D1D7E5] px-2.5 py-1.5 text-sm"
          autoComplete="off"
        />
      </label>
      {results.length ? (
        <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-[10px] border border-[#E1E5F0] bg-white shadow-lg">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-[#DDE1FF]"
                onClick={() => {
                  onPick(hit);
                  setQuery("");
                  setResults([]);
                }}
              >
                <span className="font-medium text-[#080B3A]">{hit.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-[#6B7280]">
                  {hit.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
