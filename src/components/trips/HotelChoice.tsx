"use client";

import { useEffect, useRef, useState } from "react";
import type { HotelPlacePreference } from "@/lib/hotels/hotelrec";

const PLACES: { value: HotelPlacePreference; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "center", label: "City center" },
  { value: "sights", label: "Sights" },
  { value: "beach", label: "Beach" },
  { value: "transit", label: "Transit" },
];

type Suggestion = {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviewCount: number;
  locationScore?: number | null;
  quotes: {
    author: string;
    rating: number | null;
    title?: string;
    text: string;
  }[];
};

export function HotelChoice({
  city,
  booked,
  minRating,
  place,
  selectedName,
  onBooked,
  onMinRating,
  onPlace,
  onPick,
  onResults,
}: {
  city: string;
  booked: boolean;
  minRating: number;
  place: HotelPlacePreference;
  selectedName: string;
  onBooked: (booked: boolean) => void;
  onMinRating: (rating: number) => void;
  onPlace: (place: HotelPlacePreference) => void;
  onPick: (hotel: Suggestion) => void;
  onResults?: (hotels: Suggestion[]) => void;
}) {
  const [hotels, setHotels] = useState<Suggestion[]>([]);
  const [citation, setCitation] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [openReviews, setOpenReviews] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const placeIndex = Math.max(
    0,
    PLACES.findIndex((item) => item.value === place),
  );
  const onPickRef = useRef(onPick);
  const onResultsRef = useRef(onResults);
  const selectedRef = useRef(selectedName);
  onPickRef.current = onPick;
  onResultsRef.current = onResults;
  selectedRef.current = selectedName;

  useEffect(() => {
    if (booked || city.trim().length < 2) {
      setHotels([]);
      setNote(null);
      setStatus("idle");
      onResultsRef.current?.([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStatus("loading");
      const params = new URLSearchParams({
        city: city.trim(),
        minRating: String(minRating),
        place,
      });
      void fetch(`/api/hotels/suggest?${params}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          const next = (data.hotels ?? []) as Suggestion[];
          setHotels(next);
          setCitation(data.citation ?? null);
          setNote(typeof data.note === "string" ? data.note : null);
          setStatus("ready");
          onResultsRef.current?.(next);
          if (
            next.length &&
            !next.some((hotel) => hotel.name === selectedRef.current)
          ) {
            onPickRef.current(next[0]);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setHotels([]);
          setNote(null);
          setStatus("ready");
          onResultsRef.current?.([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [booked, city, minRating, place]);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between text-[11px] font-medium text-[#080B3A]">
          <span>Hotel booked?</span>
          <span>{booked ? "Yes — plan around my hotel" : "No — suggest hotels"}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={1}
          aria-label="Hotel booked?"
          value={booked ? 1 : 0}
          onChange={(e) => onBooked(e.target.value === "1")}
          className="mt-1 w-full accent-[#0400FF]"
        />
        <div className="flex justify-between text-[10px] text-[#6B7280]">
          <span>No</span>
          <span>Yes</span>
        </div>
      </div>
      {booked ? null : (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-[#080B3A]">
              <span>Minimum rating</span>
              <span>{minRating.toFixed(1)}+</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={0.5}
              aria-label="Minimum hotel rating"
              value={minRating}
              onChange={(e) => onMinRating(Number(e.target.value))}
              className="mt-1 w-full accent-[#0400FF]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-[#080B3A]">
              <span>Places</span>
              <span>{PLACES[placeIndex]?.label}</span>
            </div>
            <input
              type="range"
              min={0}
              max={PLACES.length - 1}
              step={1}
              aria-label="Hotel place preference"
              value={placeIndex}
              onChange={(e) =>
                onPlace(PLACES[Number(e.target.value)]?.value ?? "any")
              }
              className="mt-1 w-full accent-[#0400FF]"
            />
            <div className="flex justify-between text-[10px] text-[#6B7280]">
              {PLACES.map((item) => (
                <span key={item.value}>{item.label}</span>
              ))}
            </div>
          </div>
          {status === "loading" ? (
            <p className="text-[11px] text-[#0400FF]">Looking up hotels…</p>
          ) : null}
          {note ? (
            <p className="text-[11px] leading-snug text-[#080B3A]">{note}</p>
          ) : null}
          {status === "ready" && hotels.length === 0 ? (
            <p className="text-[11px] text-[#6B7280]">
              No HotelRec hotels matched {city.trim()} at this rating. Try a
              lower rating, or set Hotel booked to Yes and enter one yourself.
              Waypoint does not invent hotels.
            </p>
          ) : null}
          <ul className="space-y-2">
            {hotels.map((hotel) => {
              const selected = hotel.name === selectedName;
              const reviewsOpen = openReviews === hotel.id;
              return (
                <li
                  key={hotel.id}
                  className={`rounded-[10px] border px-3 py-2 ${
                    selected
                      ? "border-[#0400FF] bg-[#F5F7FF]"
                      : "border-[#E1E5F0] bg-white"
                  }`}
                >
                  <p className="text-sm font-semibold text-[#080B3A]">
                    {hotel.name}
                  </p>
                  <p className="text-[11px] text-[#6B7280]">
                    {hotel.rating.toFixed(1)} / 5
                    {hotel.locationScore != null
                      ? ` · location ${hotel.locationScore.toFixed(1)} / 5`
                      : ""}
                    {" · "}
                    {hotel.reviewCount} reviews in this sample
                  </p>
                  <p className="text-[11px] text-[#6B7280]">{hotel.location}</p>
                  <div className="mt-1.5 flex gap-3">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-[#0400FF]"
                      onClick={() => onPick(hotel)}
                    >
                      {selected ? "Using this hotel" : "Use this hotel"}
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-[#0400FF]"
                      aria-expanded={reviewsOpen}
                      onClick={() =>
                        setOpenReviews(reviewsOpen ? null : hotel.id)
                      }
                    >
                      Reviews
                    </button>
                  </div>
                  {reviewsOpen ? (
                    <ul className="mt-2 space-y-2">
                      {hotel.quotes.map((quote, index) => (
                        <li
                          key={`${quote.author}-${index}`}
                          className="rounded-[8px] bg-white px-2 py-1.5"
                        >
                          <p className="text-[11px] font-semibold text-[#080B3A]">
                            {quote.author}
                            {quote.rating != null ? ` · ${quote.rating}/5` : ""}
                            <span className="font-normal text-[#6B7280]">
                              {" "}
                              · HotelRec
                            </span>
                          </p>
                          {quote.title ? (
                            <p className="text-[12px] font-medium text-[#080B3A]">
                              {quote.title}
                            </p>
                          ) : null}
                          <p className="text-[12px] leading-snug text-[#1F2937]">
                            {quote.text}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {citation && hotels.length ? (
            <p className="text-[10px] leading-snug text-[#6B7280]">
              Reviews are real quotes from {citation} Waypoint does not write
              reviews.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
