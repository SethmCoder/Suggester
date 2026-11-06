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
  lat?: number;
  lng?: number;
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
  brand,
  selectedName,
  onBooked,
  onMinRating,
  onPlace,
  onBrand,
  onPick,
  onClear,
  onResults,
}: {
  city: string;
  booked: boolean;
  minRating: number;
  place: HotelPlacePreference;
  brand: string;
  selectedName: string;
  onBooked: (booked: boolean) => void;
  onMinRating: (rating: number) => void;
  onPlace: (place: HotelPlacePreference) => void;
  onBrand: (brand: string) => void;
  onPick: (hotel: Suggestion) => void;
  onClear?: () => void;
  onResults?: (hotels: Suggestion[]) => void;
}) {
  const [hotels, setHotels] = useState<Suggestion[]>([]);
  const [citation, setCitation] = useState<string | null>(null);
  const [openReviews, setOpenReviews] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const onResultsRef = useRef(onResults);
  const onClearRef = useRef(onClear);
  const selectedRef = useRef(selectedName);
  onResultsRef.current = onResults;
  onClearRef.current = onClear;
  selectedRef.current = selectedName;

  useEffect(() => {
    if (booked || city.trim().length < 2) {
      setHotels([]);
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
      if (brand.trim().length >= 2) params.set("brand", brand.trim());
      void fetch(`/api/hotels/suggest?${params}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          const next = (data.hotels ?? []) as Suggestion[];
          setHotels(next);
          setCitation(data.citation ?? null);
          setStatus("ready");
          onResultsRef.current?.(next);
          if (
            selectedRef.current &&
            !next.some((hotel) => hotel.name === selectedRef.current)
          ) {
            onClearRef.current?.();
          }
        })
        .catch(() => {
          if (cancelled) return;
          setHotels([]);
          setStatus("ready");
          onResultsRef.current?.([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [booked, city, minRating, place, brand]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-[#F5F7FF] p-1">
        <button
          type="button"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            booked ? "text-[#6B7280]" : "bg-white text-[#080B3A] shadow-sm"
          }`}
          onClick={() => onBooked(false)}
        >
          Suggest a hotel
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            booked ? "bg-white text-[#080B3A] shadow-sm" : "text-[#6B7280]"
          }`}
          onClick={() => onBooked(true)}
        >
          I already booked
        </button>
      </div>
      {booked ? null : (
        <div className="space-y-3">
          <input
            value={brand}
            onChange={(e) => onBrand(e.target.value)}
            placeholder="Brand, such as Westin"
            aria-label="Preferred hotel brand"
            className="w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
          />
          <div className="flex flex-wrap gap-1.5">
            {[3, 4, 4.5].map((rating) => (
              <button
                key={rating}
                type="button"
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  minRating === rating
                    ? "bg-[#0400FF] text-white"
                    : "bg-[#F5F7FF] text-[#0400FF]"
                }`}
                onClick={() => onMinRating(rating)}
              >
                {rating}+ stars
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLACES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  place === item.value
                    ? "bg-[#080B3A] text-white"
                    : "bg-[#F5F7FF] text-[#080B3A]"
                }`}
                onClick={() => onPlace(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {status === "loading" ? (
            <p className="text-[11px] text-[#0400FF]">Looking up hotels…</p>
          ) : null}
          {status === "ready" && hotels.length === 0 ? (
            <p className="text-[11px] text-[#6B7280]">
              No listed hotels match that brand and rating.
            </p>
          ) : null}
          <ul className="space-y-2">
            {hotels.slice(0, 3).map((hotel) => {
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
                    {hotel.reviewCount > 0
                      ? `${hotel.rating.toFixed(1)} / 5`
                      : hotel.rating > 0
                        ? `${hotel.rating.toFixed(1)} stars`
                        : hotel.location}
                  </p>
                  <div className="mt-1.5 flex gap-3">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-[#0400FF]"
                      onClick={() => onPick(hotel)}
                    >
                      {selected ? "Using this hotel" : "Use this hotel"}
                    </button>
                    {hotel.quotes.length ? (
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
                    ) : null}
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
          {citation && openReviews ? (
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
