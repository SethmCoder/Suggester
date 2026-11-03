"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  createOfflineTripId,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import type { ActivityRow, LegTransitMode } from "@/lib/types/trip";

const INTERCITY_MODES: { value: LegTransitMode; label: string }[] = [
  { value: "auto", label: "Auto (planner picks)" },
  { value: "flight", label: "Flight" },
  { value: "major_train", label: "Major train (book)" },
  { value: "regional_rail", label: "Regional rail" },
  { value: "coach", label: "Coach / bus" },
  { value: "ferry", label: "Ferry / boat" },
  { value: "car", label: "Car / road" },
];

const CITY_CARD_COLORS = [
  { border: "border-[#0400FF]/35", bg: "bg-[#F5F7FF]", tag: "bg-[#0400FF]" },
  { border: "border-[#0F766E]/35", bg: "bg-[#F0FDFA]", tag: "bg-[#0F766E]" },
  { border: "border-[#B45309]/35", bg: "bg-[#FFF7ED]", tag: "bg-[#B45309]" },
  { border: "border-[#6D28D9]/35", bg: "bg-[#F5F3FF]", tag: "bg-[#6D28D9]" },
];

const INTERESTS = [
  "architecture",
  "history",
  "aviation",
  "technology",
  "nature",
  "food",
  "shopping",
  "museums",
  "adventure",
  "nightlife",
  "culture",
];

type LegDraft = {
  city: string;
  days: number;
  hotel: string;
  geonameId?: number;
  lat?: number;
  lng?: number;
  countryCode?: string;
  hotelLat?: number;
  hotelLng?: number;
  hotelPlaceId?: string;
  /** How you travel from the previous city's hotel to this hotel */
  transitFromPrevious: LegTransitMode;
};

type CitySuggestion = {
  id: number;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  label: string;
};

type HotelSuggestion = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  label: string;
};

type AirportSuggestion = {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  label: string;
};

function SuggestionList({
  items,
  onPick,
}: {
  items: { key: string; label: string }[];
  onPick: (index: number) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-[10px] border border-[#E1E5F0] bg-white shadow-lg">
      {items.map((item, index) => (
        <li key={item.key}>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-[#DDE1FF]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(index)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CreateTripWizard({
  previewMode = false,
}: {
  /** Demo visitors can explore the form; generating requires signup. */
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const [form, setForm] = useState({
    departureCity: "",
    originAirport: "",
    destinationAirport: "",
    startDate: "",
    travelers: 2,
    budget: "",
    currency: "USD",
    interests: [] as string[],
    customInterest: "",
    intensity: "balanced" as "relaxed" | "balanced" | "packed",
    transport: "walking",
    dietary: "",
    accessibility: "",
    dayStart: "09:00",
    dayEnd: "21:00",
    mustSee: "",
    preferred: "",
    optional: "",
    avoid: "",
    idealTrip: "",
    prefersHiddenGems: false,
  });
  const [legs, setLegs] = useState<LegDraft[]>([
    { city: "", days: 3, hotel: "", transitFromPrevious: "auto" },
  ]);
  const [citySuggestions, setCitySuggestions] = useState<
    Record<number, CitySuggestion[]>
  >({});
  const [hotelSuggestions, setHotelSuggestions] = useState<
    Record<number, HotelSuggestion[]>
  >({});
  const [departureSuggestions, setDepartureSuggestions] = useState<
    CitySuggestion[]
  >([]);
  const [departureCoords, setDepartureCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [originAirportSuggestions, setOriginAirportSuggestions] = useState<
    AirportSuggestion[]
  >([]);
  const [destAirportSuggestions, setDestAirportSuggestions] = useState<
    AirportSuggestion[]
  >([]);
  const [flightHint, setFlightHint] = useState<string | null>(null);
  const hotelTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const airportTimers = useRef<{
    origin?: ReturnType<typeof setTimeout>;
    dest?: ReturnType<typeof setTimeout>;
  }>({});

  const totalDays = useMemo(
    () => legs.reduce((s, l) => s + Math.max(1, l.days || 1), 0),
    [legs],
  );

  const endDate = useMemo(() => {
    if (!form.startDate || totalDays < 1) return "";
    const d = new Date(`${form.startDate}T12:00:00`);
    d.setDate(d.getDate() + totalDays - 1);
    return d.toISOString().slice(0, 10);
  }, [form.startDate, totalDays]);

  async function searchCities(legIndex: number, q: string) {
    if (q.trim().length < 2) {
      setCitySuggestions((s) => ({ ...s, [legIndex]: [] }));
      return;
    }
    try {
      const res = await fetch(
        `/api/cities/search?q=${encodeURIComponent(q.trim())}`,
      );
      const data = await res.json();
      setCitySuggestions((s) => ({ ...s, [legIndex]: data.cities ?? [] }));
    } catch {
      setCitySuggestions((s) => ({ ...s, [legIndex]: [] }));
    }
  }

  async function searchDepartureCities(q: string) {
    if (q.trim().length < 2) {
      setDepartureSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/cities/search?q=${encodeURIComponent(q.trim())}`,
      );
      const data = await res.json();
      setDepartureSuggestions(data.cities ?? []);
    } catch {
      setDepartureSuggestions([]);
    }
  }

  async function searchHotels(legIndex: number, q: string, immediate = false) {
    const leg = legs[legIndex];
    if (leg?.lat == null || leg?.lng == null) {
      setHotelSuggestions((s) => ({ ...s, [legIndex]: [] }));
      return;
    }
    const run = async () => {
      try {
        const params = new URLSearchParams({
          lat: String(leg.lat),
          lng: String(leg.lng),
          limit: "8",
        });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/hotels/search?${params}`);
        const data = await res.json();
        setHotelSuggestions((s) => ({
          ...s,
          [legIndex]: data.hotels ?? [],
        }));
      } catch {
        setHotelSuggestions((s) => ({ ...s, [legIndex]: [] }));
      }
    };
    clearTimeout(hotelTimers.current[legIndex]);
    if (immediate) void run();
    else hotelTimers.current[legIndex] = setTimeout(run, 280);
  }

  async function searchAirportsFor(
    which: "origin" | "dest",
    q: string,
    near: { lat: number; lng: number } | null,
    immediate = false,
  ) {
    const run = async () => {
      try {
        const params = new URLSearchParams({ limit: "8" });
        if (q.trim()) params.set("q", q.trim());
        if (near) {
          params.set("lat", String(near.lat));
          params.set("lng", String(near.lng));
        }
        if (!q.trim() && !near) {
          if (which === "origin") setOriginAirportSuggestions([]);
          else setDestAirportSuggestions([]);
          return;
        }
        const res = await fetch(`/api/flights/lookup?${params}`);
        const data = await res.json();
        const list = (data.airports ?? []) as AirportSuggestion[];
        if (which === "origin") setOriginAirportSuggestions(list);
        else setDestAirportSuggestions(list);
      } catch {
        if (which === "origin") setOriginAirportSuggestions([]);
        else setDestAirportSuggestions([]);
      }
    };
    clearTimeout(airportTimers.current[which]);
    if (immediate) void run();
    else airportTimers.current[which] = setTimeout(run, 220);
  }

  async function refreshFlightEstimate(from?: string, to?: string) {
    const origin = from || form.originAirport || form.departureCity;
    const dest = to || form.destinationAirport || legs[0]?.city;
    if (!origin || !dest) {
      setFlightHint(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/flights/lookup?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.estimate) {
        setFlightHint(data.error ?? "Could not estimate this flight");
        return;
      }
      const e = data.estimate;
      setForm((f) => ({
        ...f,
        originAirport: e.from.iata,
        destinationAirport: e.to.iata,
        dayStart: e.routeKnown ? e.suggestedDayStart : f.dayStart,
      }));
      setFlightHint(
        e.routeKnown
          ? `${e.from.iata} → ${e.to.iata} · ~${Math.round(e.durationMinutes / 60)}h ${e.durationMinutes % 60}m · lands ~${e.estimatedArrivalLocal} local${e.arrivalDayOffset ? ` (+${e.arrivalDayOffset}d)` : ""} · sightseeing from ${e.suggestedDayStart}. ${e.note}`
          : e.note,
      );
    } catch {
      setFlightHint("Flight lookup unavailable right now");
    }
  }

  function pickCity(legIndex: number, c: CitySuggestion) {
    setLegs((prev) =>
      prev.map((l, i) =>
        i === legIndex
          ? {
              ...l,
              city: c.name,
              geonameId: c.id,
              lat: c.lat,
              lng: c.lng,
              countryCode: c.countryCode,
            }
          : l,
      ),
    );
    setCitySuggestions((s) => ({ ...s, [legIndex]: [] }));
    // Prefetch nearby hotels + suggest arrival airport for first city
    void (async () => {
      try {
        const params = new URLSearchParams({
          lat: String(c.lat),
          lng: String(c.lng),
          limit: "8",
        });
        const res = await fetch(`/api/hotels/search?${params}`);
        const data = await res.json();
        setHotelSuggestions((s) => ({
          ...s,
          [legIndex]: data.hotels ?? [],
        }));
      } catch {
        /* ignore */
      }
      if (legIndex === 0) {
        void searchAirportsFor("dest", "", { lat: c.lat, lng: c.lng }, true);
      }
    })();
  }

  function pickHotel(legIndex: number, h: HotelSuggestion) {
    setLegs((prev) =>
      prev.map((l, i) =>
        i === legIndex
          ? {
              ...l,
              hotel: h.name,
              hotelLat: h.lat,
              hotelLng: h.lng,
              hotelPlaceId: h.placeId,
            }
          : l,
      ),
    );
    setHotelSuggestions((s) => ({ ...s, [legIndex]: [] }));
  }

  function pickDepartureCity(c: CitySuggestion) {
    setForm((f) => ({ ...f, departureCity: c.name }));
    setDepartureCoords({ lat: c.lat, lng: c.lng });
    setDepartureSuggestions([]);
    void searchAirportsFor("origin", "", { lat: c.lat, lng: c.lng }, true);
  }

  function pickAirport(which: "origin" | "dest", a: AirportSuggestion) {
    if (which === "origin") {
      setForm((f) => ({ ...f, originAirport: a.iata }));
      setOriginAirportSuggestions([]);
      void refreshFlightEstimate(a.iata, form.destinationAirport || legs[0]?.city);
    } else {
      setForm((f) => ({ ...f, destinationAirport: a.iata }));
      setDestAirportSuggestions([]);
      void refreshFlightEstimate(form.originAirport || form.departureCity, a.iata);
    }
  }

  // When first destination city gains coords, seed arrival-airport options
  useEffect(() => {
    const first = legs[0];
    if (first?.lat != null && first?.lng != null && !form.destinationAirport) {
      void searchAirportsFor(
        "dest",
        "",
        { lat: first.lat, lng: first.lng },
        true,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on first-leg coords
  }, [legs[0]?.lat, legs[0]?.lng]);

  function toggleInterest(i: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(i)
        ? f.interests.filter((x) => x !== i)
        : [...f.interests, i],
    }));
  }

  async function submit() {
    if (previewMode) {
      setError(null);
      router.push("/signup?next=/trips/new");
      return;
    }
    setLoading(true);
    setError(null);
    setProgress("Saving trip…");
    const destination = legs.map((l) => l.city).filter(Boolean).join(" → ");
    const body = {
      destination,
      departureCity: form.departureCity,
      originAirport: form.originAirport || undefined,
      destinationAirport: form.destinationAirport || undefined,
      startDate: form.startDate,
      endDate,
      travelers: form.travelers,
      budget: form.budget ? Number(form.budget) : undefined,
      currency: form.currency,
      interests: [
        ...form.interests,
        ...(form.customInterest ? [form.customInterest] : []),
      ],
      intensity: form.intensity,
      transport: form.transport,
      hotel: legs[0]?.hotel || undefined,
      dietary: form.dietary,
      accessibility: form.accessibility,
      dayStart: form.dayStart,
      dayEnd: form.dayEnd,
      prefersHiddenGems: form.prefersHiddenGems,
      mustSee: splitList(form.mustSee),
      preferred: splitList(form.preferred),
      optional: splitList(form.optional),
      avoid: splitList(form.avoid),
      idealTrip: form.idealTrip,
      legs: legs
        .filter((l) => l.city.trim())
        .map((l, i) => ({
          city: l.city.trim(),
          days: Math.max(1, Number(l.days) || 1),
          hotel: l.hotel.trim() || undefined,
          geonameId: l.geonameId,
          lat: l.lat,
          lng: l.lng,
          countryCode: l.countryCode,
          hotelLat: l.hotelLat,
          hotelLng: l.hotelLng,
          hotelPlaceId: l.hotelPlaceId,
          transitFromPrevious:
            i === 0 ? undefined : l.transitFromPrevious || "auto",
        })),
    };

    const saveOfflineFallback = () => {
      setProgress("Saving on this device…");
      const tripId = createOfflineTripId();
      const totalDays = Math.max(
        1,
        body.legs.reduce((sum, l) => sum + l.days, 0) ||
          Math.max(
            1,
            Math.round(
              (new Date(endDate).getTime() -
                new Date(form.startDate).getTime()) /
                86400000,
            ) + 1,
          ),
      );
      const days = Array.from({ length: totalDays }, (_, i) => ({
        id: `${tripId}-day-${i}`,
        day_index: i,
      }));
      const activities: ActivityRow[] = days.map((d, i) => ({
        id: `${tripId}-act-${i}`,
        day_id: d.id,
        name: i === 0 ? `Explore ${destination || "your destination"}` : `Day ${i + 1} free block`,
        place_id: null,
        address: null,
        lat: body.legs[0]?.lat ?? null,
        lng: body.legs[0]?.lng ?? null,
        start_time: `${form.dayStart || "10:00"}:00`,
        end_time: null,
        duration_minutes: 120,
        travel_minutes_from_prev: 0,
        priority: "preferred",
        planning_note:
          "Saved offline — open while online to regenerate a full itinerary.",
        hours_verified: false,
        opening_hours: null,
        website_uri: null,
        google_maps_uri: null,
        photo_name: null,
        popularity_label: null,
        popularity_sources: null,
        popularity_attribution_urls: null,
        schedule_warnings: ["Created offline — regenerate when connected"],
        user_locked: false,
        completed: false,
        source: "offline",
        sort_order: 0,
      }));
      saveOfflineTrip({
        trip: {
          id: tripId,
          destination: destination || "Untitled trip",
          start_date: form.startDate,
          end_date: endDate,
          cover_image_url: null,
          created_at: new Date().toISOString(),
          day_count: days.length,
        },
        days,
        activities,
        updatedAt: new Date().toISOString(),
        offlineOnly: true,
      });
      router.push(`/trips/${tripId}`);
      router.refresh();
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        saveOfflineFallback();
        return;
      }
      const res = await fetch("/api/trips/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setProgress("Generating itinerary…");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      // Mirror server trip locally so later offline edits still work
      try {
        const tripId = data.tripId as string;
        const detail = await fetch(`/api/trips/${tripId}`);
        if (detail.ok) {
          const full = await detail.json();
          if (full?.trip && full?.days) {
            saveOfflineTrip({
              trip: {
                id: tripId,
                destination: full.trip.destination,
                start_date: full.trip.start_date,
                end_date: full.trip.end_date,
                cover_image_url: full.trip.cover_image_url ?? null,
                created_at: full.trip.created_at ?? new Date().toISOString(),
                day_count: full.days.length,
              },
              days: full.days.map(
                (d: { id: string; day_index: number }) => ({
                  id: d.id,
                  day_index: d.day_index,
                }),
              ),
              activities: full.activities ?? [],
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        /* optional mirror */
      }
      router.push(`/trips/${data.tripId}`);
      router.refresh();
    } catch (e) {
      try {
        saveOfflineFallback();
      } catch {
        setError(e instanceof Error ? e.message : "Failed");
      }
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <div className="mx-auto max-w-2xl" data-tour="tour-create-wizard">
      {previewMode ? (
        <div className="mb-4 rounded-[12px] border border-[#DDE1FF] bg-[#F5F7FF] px-4 py-3 text-sm text-[#080B3A]">
          <p className="font-semibold">Demo preview — create trip</p>
          <p className="mt-1 text-[#6B7280]">
            Try cities, dates, hotels, and interests here. Generating a real
            itinerary needs a free account — you&apos;ll be guided to sign up
            when you finish.
          </p>
        </div>
      ) : null}
      <div className="mb-2">
        <h1 className="text-[28px] font-bold tracking-tight text-[#080B3A]">
          {previewMode ? "Create a trip (preview)" : "Create a trip"}
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          A guided planning flow — skip optional fields anytime.
        </p>
      </div>
      <div className="mb-6 mt-5 flex gap-2">
        {["Basics", "Style", "Priorities", "Review"].map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-[12px] py-2.5 text-center text-xs font-semibold ${
              i === step
                ? "bg-[#0400FF] text-white shadow-md shadow-[#0400FF]/25"
                : i < step
                  ? "bg-[#DDE1FF] text-[#0400FF]"
                  : "border border-[#E1E5F0] bg-white text-[#6B7280]"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_8px_28px_rgba(8,11,58,0.06)] sm:p-8">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-[20px] font-semibold text-[#080B3A]">
              Trip basics
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Cities & hotels</Label>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#0400FF]"
                  onClick={() =>
                    setLegs((prev) => [
                      ...prev,
                      {
                        city: "",
                        days: 2,
                        hotel: "",
                        transitFromPrevious: "auto",
                      },
                    ])
                  }
                >
                  + Add city
                </button>
              </div>
              <p className="text-xs text-[#6B7280]">
                Each card is a different city stay with its own hotel. Between
                cities, choose how you travel hotel → hotel (e.g. Dubai hotel →
                Abu Dhabi hotel).
              </p>
              {legs.map((leg, i) => {
                const palette =
                  CITY_CARD_COLORS[i % CITY_CARD_COLORS.length];
                const prev = i > 0 ? legs[i - 1] : null;
                const fromLabel =
                  prev?.hotel?.trim() ||
                  (prev?.city?.trim()
                    ? `${prev.city.trim()} hotel`
                    : "Previous hotel");
                const toLabel =
                  leg.hotel?.trim() ||
                  (leg.city?.trim()
                    ? `${leg.city.trim()} hotel`
                    : "This hotel");
                return (
                  <div key={i} className="space-y-2">
                    {i > 0 ? (
                      <div className="relative mx-1 rounded-[12px] border border-dashed border-[#C5CAD8] bg-[#FAFBFF] px-3 py-3">
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${CITY_CARD_COLORS[(i - 1) % CITY_CARD_COLORS.length].tag}`}
                          />
                          Place to place
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${palette.tag}`}
                          />
                        </div>
                        <p className="mb-2 text-sm font-medium text-[#080B3A]">
                          {fromLabel}
                          <span className="mx-2 text-[#0400FF]">→</span>
                          {toLabel}
                        </p>
                        <p className="mb-2 text-[11px] text-[#6B7280]">
                          {(prev?.city || "City A").trim() || "City A"}
                          {" → "}
                          {(leg.city || "City B").trim() || "City B"} · leave
                          one city hotel, arrive at the next
                        </p>
                        <Label>Mode of transportation</Label>
                        <select
                          className="mt-1 w-full rounded-lg border border-[#D1D7E5] bg-white px-3 py-2 text-sm"
                          value={leg.transitFromPrevious || "auto"}
                          onChange={(e) =>
                            setLegs((prevLegs) =>
                              prevLegs.map((l, j) =>
                                j === i
                                  ? {
                                      ...l,
                                      transitFromPrevious: e.target
                                        .value as LegTransitMode,
                                    }
                                  : l,
                              ),
                            )
                          }
                        >
                          {INTERCITY_MODES.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div
                      className={`relative space-y-3 rounded-[14px] border-2 ${palette.border} ${palette.bg} p-4`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-bold text-white ${palette.tag}`}
                          >
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[#080B3A]">
                              City {i + 1}
                              {leg.city.trim() ? ` · ${leg.city.trim()}` : ""}
                            </p>
                            <p className="text-[11px] text-[#6B7280]">
                              Separate stay — set this city’s hotel below
                            </p>
                          </div>
                        </div>
                        {legs.length > 1 ? (
                          <button
                            type="button"
                            className="text-xs text-[#DC2626]"
                            onClick={() =>
                              setLegs((prevLegs) =>
                                prevLegs.filter((_, j) => j !== i),
                              )
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_88px]">
                        <div className="relative">
                          <Label>City name</Label>
                          <Input
                            required
                            value={leg.city}
                            onChange={(e) => {
                              const city = e.target.value;
                              setLegs((prevLegs) =>
                                prevLegs.map((l, j) =>
                                  j === i
                                    ? {
                                        ...l,
                                        city,
                                        geonameId: undefined,
                                        lat: undefined,
                                        lng: undefined,
                                      }
                                    : l,
                                ),
                              );
                              void searchCities(i, city);
                            }}
                            className="mt-1 bg-white"
                            placeholder={
                              i === 0
                                ? "e.g. Dubai"
                                : i === 1
                                  ? "e.g. Abu Dhabi"
                                  : "Next city"
                            }
                            autoComplete="off"
                          />
                          {(citySuggestions[i]?.length ?? 0) > 0 ? (
                            <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-[10px] border border-[#E1E5F0] bg-white shadow-lg">
                              {citySuggestions[i].map((c) => (
                                <li key={c.id}>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#DDE1FF]"
                                    onClick={() => pickCity(i, c)}
                                  >
                                    {c.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div>
                          <Label>Days</Label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={leg.days}
                            onChange={(e) =>
                              setLegs((prevLegs) =>
                                prevLegs.map((l, j) =>
                                  j === i
                                    ? {
                                        ...l,
                                        days: Math.max(
                                          1,
                                          Number(e.target.value) || 1,
                                        ),
                                      }
                                    : l,
                                ),
                              )
                            }
                            className="mt-1 bg-white"
                          />
                        </div>
                      </div>
                      <div className="relative rounded-[10px] border border-white/80 bg-white/90 p-3">
                        <Label>
                          Hotel in{" "}
                          {leg.city.trim() || `city ${i + 1}`}
                        </Label>
                        <Input
                          value={leg.hotel}
                          onChange={(e) => {
                            const hotel = e.target.value;
                            setLegs((prevLegs) =>
                              prevLegs.map((l, j) =>
                                j === i
                                  ? {
                                      ...l,
                                      hotel,
                                      hotelLat: undefined,
                                      hotelLng: undefined,
                                      hotelPlaceId: undefined,
                                    }
                                  : l,
                              ),
                            );
                            void searchHotels(i, hotel);
                          }}
                          onFocus={() => {
                            if (leg.lat != null && leg.lng != null) {
                              void searchHotels(i, leg.hotel, true);
                            }
                          }}
                          className="mt-1"
                          placeholder={
                            leg.lat != null
                              ? "Search hotels in this city"
                              : "Pick a city first"
                          }
                          autoComplete="off"
                          disabled={leg.lat == null}
                        />
                        <SuggestionList
                          items={(hotelSuggestions[i] ?? []).map((h) => ({
                            key: h.placeId,
                            label: h.label,
                          }))}
                          onPick={(idx) =>
                            pickHotel(i, hotelSuggestions[i][idx])
                          }
                        />
                        {leg.lat != null && !(hotelSuggestions[i]?.length) ? (
                          <p className="mt-1 text-[11px] text-[#6B7280]">
                            Focus or type to list nearby hotels from
                            OpenStreetMap.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-[#6B7280]">
                Total itinerary length: <strong>{totalDays}</strong> days
                {endDate ? ` · ends ${endDate}` : ""}
              </p>
            </div>
            <div className="relative">
              <Label>Departure city (optional)</Label>
              <Input
                value={form.departureCity}
                onChange={(e) => {
                  setForm({ ...form, departureCity: e.target.value });
                  setDepartureCoords(null);
                  void searchDepartureCities(e.target.value);
                }}
                className="mt-1"
                placeholder="Seattle"
                autoComplete="off"
              />
              <SuggestionList
                items={departureSuggestions.map((c) => ({
                  key: String(c.id),
                  label: c.label,
                }))}
                onPick={(idx) => pickDepartureCity(departureSuggestions[idx])}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative">
                <Label>Start airport (IATA)</Label>
                <Input
                  value={form.originAirport}
                  onChange={(e) => {
                    const originAirport = e.target.value.toUpperCase();
                    setForm({ ...form, originAirport });
                    void searchAirportsFor(
                      "origin",
                      originAirport,
                      departureCoords,
                    );
                  }}
                  onFocus={() =>
                    void searchAirportsFor(
                      "origin",
                      form.originAirport,
                      departureCoords,
                      true,
                    )
                  }
                  onBlur={() => {
                    window.setTimeout(() => {
                      void refreshFlightEstimate();
                      setOriginAirportSuggestions([]);
                    }, 150);
                  }}
                  className="mt-1"
                  placeholder="SEA or search…"
                  autoComplete="off"
                />
                <SuggestionList
                  items={originAirportSuggestions.map((a) => ({
                    key: a.iata + a.name,
                    label: a.label,
                  }))}
                  onPick={(idx) =>
                    pickAirport("origin", originAirportSuggestions[idx])
                  }
                />
              </div>
              <div className="relative">
                <Label>Arrival airport (IATA)</Label>
                <Input
                  value={form.destinationAirport}
                  onChange={(e) => {
                    const destinationAirport = e.target.value.toUpperCase();
                    setForm({ ...form, destinationAirport });
                    const near =
                      legs[0]?.lat != null && legs[0]?.lng != null
                        ? { lat: legs[0].lat, lng: legs[0].lng }
                        : null;
                    void searchAirportsFor("dest", destinationAirport, near);
                  }}
                  onFocus={() => {
                    const near =
                      legs[0]?.lat != null && legs[0]?.lng != null
                        ? { lat: legs[0].lat, lng: legs[0].lng }
                        : null;
                    void searchAirportsFor(
                      "dest",
                      form.destinationAirport,
                      near,
                      true,
                    );
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      void refreshFlightEstimate();
                      setDestAirportSuggestions([]);
                    }, 150);
                  }}
                  className="mt-1"
                  placeholder="HND or search…"
                  autoComplete="off"
                />
                <SuggestionList
                  items={destAirportSuggestions.map((a) => ({
                    key: a.iata + a.name,
                    label: a.label,
                  }))}
                  onPick={(idx) =>
                    pickAirport("dest", destAirportSuggestions[idx])
                  }
                />
              </div>
            </div>
            {flightHint ? (
              <p className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F7FF] px-3 py-2 text-xs text-[#080B3A]">
                {flightHint}
              </p>
            ) : (
              <p className="text-xs text-[#6B7280]">
                Pick airports from the lists (nearest to your cities) to estimate
                arrival from OpenFlights so day 1 does not schedule impossible
                morning stops.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>End date (from city days)</Label>
                <Input
                  type="date"
                  required
                  value={endDate}
                  readOnly
                  className="mt-1 bg-[#F5F7FF]"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Travelers</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.travelers}
                  onChange={(e) =>
                    setForm({ ...form, travelers: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Budget (optional)</Label>
                <Input
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) =>
                    setForm({ ...form, currency: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-[20px] font-semibold text-[#080B3A]">Travel style</h2>
            <div>
              <Label>Interests</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {INTERESTS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleInterest(i)}
                    className={`rounded-full px-3 py-1 text-xs capitalize ${
                      form.interests.includes(i)
                        ? "bg-[#0400FF] text-white"
                        : "bg-[#DDE1FF] text-[#0400FF]"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Custom interest"
                value={form.customInterest}
                onChange={(e) =>
                  setForm({ ...form, customInterest: e.target.value })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>Pace</Label>
              <select
                className="mt-1 w-full rounded-lg border border-[#D1D7E5] px-3 py-2 text-sm"
                value={form.intensity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    intensity: e.target.value as typeof form.intensity,
                  })
                }
              >
                <option value="relaxed">Relaxed</option>
                <option value="balanced">Balanced</option>
                <option value="packed">Packed</option>
              </select>
            </div>
            <div>
              <Label>Within-city transportation</Label>
              <select
                className="mt-1 w-full rounded-lg border border-[#D1D7E5] px-3 py-2 text-sm"
                value={form.transport}
                onChange={(e) =>
                  setForm({ ...form, transport: e.target.value })
                }
              >
                <option value="walking">Walking</option>
                <option value="transit">Public transit</option>
                <option value="driving">Driving</option>
                <option value="cycling">Cycling</option>
              </select>
              <p className="mt-1 text-[11px] text-[#6B7280]">
                How you get around inside each city. City-to-city travel
                (hotel → hotel) is set on step 1 between city cards.
              </p>
            </div>
            <p className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F7FF] px-3 py-2 text-xs text-[#6B7280]">
              Each city has its own hotel on step 1. Sightseeing is ranked
              around that hotel pin — the planner only uses real mapped places.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.prefersHiddenGems}
                onChange={(e) =>
                  setForm({ ...form, prefersHiddenGems: e.target.checked })
                }
              />
              Prefer hidden gems over trending spots
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-[20px] font-semibold text-[#080B3A]">Activity priorities</h2>
            <div>
              <Label>Must-see</Label>
              <Input
                value={form.mustSee}
                onChange={(e) => setForm({ ...form, mustSee: e.target.value })}
                className="mt-1"
                placeholder="Comma separated"
              />
            </div>
            <div>
              <Label>Preferred</Label>
              <Input
                value={form.preferred}
                onChange={(e) =>
                  setForm({ ...form, preferred: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Optional</Label>
              <Input
                value={form.optional}
                onChange={(e) => setForm({ ...form, optional: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Avoid</Label>
              <Input
                value={form.avoid}
                onChange={(e) => setForm({ ...form, avoid: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Describe your ideal trip</Label>
              <textarea
                rows={4}
                className="mt-1 w-full rounded-lg border border-[#D1D7E5] px-3 py-2 text-sm"
                value={form.idealTrip}
                onChange={(e) =>
                  setForm({ ...form, idealTrip: e.target.value })
                }
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <h2 className="text-[20px] font-semibold text-[#080B3A]">Review</h2>
            <div className="space-y-2">
              <span className="text-[#6B7280]">Cities & place-to-place:</span>
              <ul className="space-y-2">
                {legs
                  .filter((l) => l.city.trim())
                  .map((l, i, arr) => {
                    const modeLabel =
                      INTERCITY_MODES.find(
                        (m) => m.value === (l.transitFromPrevious || "auto"),
                      )?.label ?? "Auto";
                    const prev = i > 0 ? arr[i - 1] : null;
                    return (
                      <li key={i} className="rounded-[10px] border border-[#E1E5F0] bg-[#F5F7FF] px-3 py-2">
                        {i > 0 && prev ? (
                          <p className="mb-1 text-[11px] text-[#0400FF]">
                            {(prev.hotel || `${prev.city} hotel`) +
                              " → " +
                              (l.hotel || `${l.city} hotel`)}
                            {" · "}
                            {modeLabel}
                          </p>
                        ) : null}
                        <p className="font-medium text-[#080B3A]">
                          City {i + 1}: {l.city} · {l.days}d
                          {l.hotel ? ` · Hotel: ${l.hotel}` : " · (no hotel yet)"}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            </div>
            <p>
              <span className="text-[#6B7280]">Dates:</span> {form.startDate} –{" "}
              {endDate}
            </p>
            <p>
              <span className="text-[#6B7280]">Interests:</span>{" "}
              {form.interests.join(", ") || "General"}
            </p>
            {progress ? (
              <p className="text-[#0400FF]">{progress}</p>
            ) : null}
            {error ? <p className="text-[#DC2626]">{error}</p> : null}
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <Button
            type="button"
            variant="secondary"
            disabled={step === 0 || loading}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                step === 0 &&
                (!legs.some((l) => l.city.trim()) || !form.startDate)
              }
            >
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={loading}>
              {loading
                ? "Working…"
                : previewMode
                  ? "Sign up to generate"
                  : "Generate itinerary"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function splitList(s: string) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
