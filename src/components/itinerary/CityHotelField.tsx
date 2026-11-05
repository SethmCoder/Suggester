"use client";

import { useEffect, useState } from "react";

type HotelHit = {
  id: string;
  name: string;
  propertyType: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  starRating: number | null;
  amenities: string[];
  checkIn: string | null;
  checkOut: string | null;
  chain: string | null;
  lastVerifiedAt: string;
  attribution?: string;
};

const TYPE_LABEL: Record<string, string> = {
  hotel: "Hotel",
  motel: "Motel",
  hostel: "Hostel",
  guest_house: "Guest house",
  apartment: "Apartment",
  chalet: "Chalet",
  bed_and_breakfast: "Bed and breakfast",
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
    hotelAddress?: string;
  }) => void;
}) {
  const [matches, setMatches] = useState<HotelHit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<HotelHit | null>(null);

  useEffect(() => {
    if (city.trim().length < 2) {
      setMatches([]);
      setStatus("idle");
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setStatus("idle");
      if (!picked) setMatches([]);
      return;
    }
    if (picked && picked.name === q) return;
    let cancelled = false;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ city: city.trim(), q, limit: "8" });
      if (lat != null && lng != null) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
      }
      void fetch(`/api/hotels/catalog?${params}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setMatches((data.hotels ?? []) as HotelHit[]);
          setStatus("ready");
          setOpen(true);
        })
        .catch(() => {
          if (cancelled) return;
          setMatches([]);
          setStatus("ready");
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [city, lat, lng, value, picked]);

  return (
    <div className="relative">
      <input
        className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-1.5 text-sm text-[#1F2937] outline-none focus:border-[#818CF8] focus:ring-2 focus:ring-[#818CF8]/40"
        value={value}
        placeholder={`Search hotels in ${city || "this city"}`}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setPicked(null);
          onChange({
            hotel: e.target.value,
            hotelLat: undefined,
            hotelLng: undefined,
            hotelPlaceId: undefined,
          });
        }}
      />
      {status === "idle" && value.trim().length < 2 ? (
        <p className="mt-1 text-[11px] text-[#6B7280]">Type a hotel name in {city}.</p>
      ) : null}
      {status === "loading" ? (
        <p className="mt-1 text-[11px] text-[#6B7280]">Searching hotels in {city}…</p>
      ) : null}
      {open && status === "ready" && matches.length === 0 ? (
        <p className="mt-1 text-[11px] text-[#6B7280]">
          No hotels found{value.trim().length >= 2 ? ` for “${value.trim()}”` : ""} in {city}.
        </p>
      ) : null}
      {open && matches.length ? (
        <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
          {matches.map((hotel) => {
            const selected = hotel.name === value;
            return (
              <li key={hotel.id}>
                <button
                  type="button"
                  className={`w-full rounded-[10px] border px-2.5 py-1.5 text-left ${
                    selected ? "border-[#1616C9] bg-[#EEEEFF]" : "border-[#E5E7EB] bg-white"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPicked(hotel);
                    setOpen(false);
                    onChange({
                      hotel: hotel.name,
                      hotelLat: hotel.latitude,
                      hotelLng: hotel.longitude,
                      hotelPlaceId: hotel.id,
                      hotelAddress: hotel.address ?? undefined,
                    });
                  }}
                >
                  <span className="block text-sm font-medium text-[#1F2937]">
                    {hotel.name}
                    {hotel.starRating != null ? (
                      <span className="ml-1.5 text-[11px] font-normal text-[#6B7280]">
                        {hotel.starRating}★
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[11px] text-[#6B7280]">
                    {TYPE_LABEL[hotel.propertyType] ?? "Stay"}
                    {hotel.address ? ` · ${hotel.address}` : hotel.city ? ` · ${hotel.city}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {picked && picked.name === value ? (
        <div className="mt-2 rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] text-[#1F2937]">
          <p className="font-medium">
            {TYPE_LABEL[picked.propertyType] ?? "Stay"}
            {picked.starRating != null ? ` · ${picked.starRating}★` : ""}
          </p>
          {picked.address ? <p className="mt-1 text-[#6B7280]">{picked.address}</p> : null}
          {picked.chain ? <p className="mt-1">Group: {picked.chain}</p> : null}
          {picked.phone ? <p className="mt-1">{picked.phone}</p> : null}
          {picked.website ? (
            <a
              href={picked.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block font-medium text-[#1616C9]"
            >
              Website
            </a>
          ) : null}
          {picked.amenities.length ? (
            <p className="mt-1 text-[#6B7280]">{picked.amenities.join(" · ")}</p>
          ) : null}
          {(picked.checkIn || picked.checkOut) ? (
            <p className="mt-1 text-[#6B7280]">
              {picked.checkIn ? `Check-in ${picked.checkIn}` : ""}
              {picked.checkIn && picked.checkOut ? " · " : ""}
              {picked.checkOut ? `Check-out ${picked.checkOut}` : ""}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] text-[#6B7280]">
            © OpenStreetMap contributors · ODbL · checked {picked.lastVerifiedAt.slice(0, 10)}
          </p>
        </div>
      ) : matches.length ? (
        <p className="mt-1 text-[10px] text-[#6B7280]">© OpenStreetMap contributors · ODbL</p>
      ) : null}
    </div>
  );
}
