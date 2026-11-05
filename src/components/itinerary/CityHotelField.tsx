"use client";

import { useEffect, useRef, useState } from "react";

type HotelMatch = {
  id: string;
  name: string;
  label: string;
  rating: number | null;
  lat: number | null;
  lng: number | null;
};

export function CityHotelField({
  city,
  value,
  lat,
  lng,
  onChange,
}: {
  city: string;
  value: string;
  lat?: number;
  lng?: number;
  onChange: (next: {
    hotel: string;
    hotelLat?: number;
    hotelLng?: number;
    hotelPlaceId?: string;
  }) => void;
}) {
  const [matches, setMatches] = useState<HotelMatch[]>([]);
  const [open, setOpen] = useState(false);
  const pickedRef = useRef<string | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1 || city.trim().length < 2) {
      setMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ city: city.trim(), q });
      if (lat != null && lng != null) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
      }
      void fetch(`/api/hotels/match?${params}`)
        .then((res) => res.json())
        .then((data) => {
          if (pickedRef.current === q) {
            setMatches([]);
            setOpen(false);
            return;
          }
          setMatches((data.hotels ?? []) as HotelMatch[]);
          setOpen(true);
        })
        .catch(() => setMatches([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value, city, lat, lng]);

  return (
    <div className="relative">
      <input
        className="mt-1 w-full rounded-lg border border-[#D1D7E5] bg-white px-2.5 py-1.5 text-sm"
        value={value}
        placeholder={`Hotel name in ${city}`}
        autoComplete="off"
        onChange={(e) =>
          onChange({
            hotel: e.target.value,
            hotelLat: undefined,
            hotelLng: undefined,
            hotelPlaceId: undefined,
          })
        }
        onFocus={() => {
          if (matches.length) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && matches.length ? (
        <ul className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-[10px] border border-[#E1E5F0] bg-white shadow-lg">
          {matches.map((hotel) => (
            <li key={hotel.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-[#DDE1FF]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  pickedRef.current = hotel.name;
                  onChange({
                    hotel: hotel.name,
                    hotelLat: hotel.lat ?? undefined,
                    hotelLng: hotel.lng ?? undefined,
                    hotelPlaceId: hotel.lat != null ? hotel.id : undefined,
                  });
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium text-[#080B3A]">
                  {hotel.name}
                  {hotel.rating != null ? (
                    <span className="ml-1.5 text-[11px] font-normal text-[#6B7280]">
                      {hotel.rating.toFixed(1)}/5
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-[#6B7280]">
                  {hotel.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
