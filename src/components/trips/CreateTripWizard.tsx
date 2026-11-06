"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  countCreatedOfflineTrips,
  createOfflineTripId,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import { PLAN_LIMIT_MESSAGE } from "@/lib/billing/plans";
import { offlineSnapshotFromGenerated } from "@/lib/trips/offline-from-generated";
import type { GeneratedDay } from "@/lib/ai/generate-itinerary";
import { CityHotelField } from "@/components/itinerary/CityHotelField";
import { HotelChoice } from "@/components/trips/HotelChoice";
import { TripAgentDesk } from "@/components/trips/TripAgentDesk";
import {
  filterAirlines,
  type AirlineOption,
  type PricePoint,
} from "@/lib/flights/airline-class";
import type { HotelPlacePreference } from "@/lib/hotels/hotelrec";
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
  hotelAddress?: string;
  /** How you travel from the previous city's hotel to this hotel */
  transitFromPrevious: LegTransitMode;
  hotelBooked: boolean;
  hotelMinRating: number;
  hotelPlace: HotelPlacePreference;
  hotelBrand: string;
};

type CitySuggestion = {
  id: number;
  name: string;
  countryCode: string;
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
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>(
    {},
  );
  const [clarifyPrompts, setClarifyPrompts] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planLimited, setPlanLimited] = useState(false);
  const [progress, setProgress] = useState("");
  const [party, setParty] = useState("");
  const [canGenerate, setCanGenerate] = useState<boolean | null>(null);

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
    preferredAirlines: "",
    flightPricePoint: "any" as PricePoint,
    chosenAirline: "",
  });
  const [routeAirlines, setRouteAirlines] = useState<AirlineOption[]>([]);
  const [legs, setLegs] = useState<LegDraft[]>([
    {
      city: "",
      days: 3,
      hotel: "",
      transitFromPrevious: "auto",
      hotelBooked: false,
      hotelMinRating: 4,
      hotelPlace: "center",
      hotelBrand: "",
    },
  ]);
  const [citySuggestions, setCitySuggestions] = useState<
    Record<number, CitySuggestion[]>
  >({});
  const [recLists, setRecLists] = useState<
    Record<number, { id: string; name: string; rating: number; location: string }[]>
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
        setRouteAirlines([]);
        setFlightHint(data.error ?? "Could not estimate this flight");
        return;
      }
      const e = data.estimate;
      setRouteAirlines(Array.isArray(e.airlines) ? e.airlines : []);
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
    if (legIndex === 0) {
      void searchAirportsFor("dest", "", { lat: c.lat, lng: c.lng }, true);
    }
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/billing")
      .then((res) => res.json())
      .then((data: { generateAllowed?: boolean }) => {
        if (!cancelled) setCanGenerate(Boolean(data.generateAllowed));
      })
      .catch(() => {
        if (!cancelled) setCanGenerate(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function noteFromChat(text: string) {
    if (
      /\b(kid|kids|child|children|sister|brother|partner|wife|husband|friend|mom|dad|parent|family|solo|alone)\b/i.test(
        text,
      )
    ) {
      setParty(text.trim());
    }
    setForm((current) => {
      let transport = current.transport;
      let intensity = current.intensity;
      const interests = [...current.interests];
      if (/\bdriv/i.test(text)) transport = "driving";
      else if (/\b(transit|metro|subway|bus)\b/i.test(text)) transport = "transit";
      else if (/\bcycl/i.test(text)) transport = "cycling";
      else if (/\bwalk/i.test(text)) transport = "walking";
      if (/\b(relax|slow|easy)\b/i.test(text)) intensity = "relaxed";
      else if (/\b(packed|busy)\b/i.test(text)) intensity = "packed";
      if (/\b(food|restaurant|meal)\b/i.test(text) && !interests.includes("food")) {
        interests.push("food");
      }
      return { ...current, transport, intensity, interests };
    });
  }

  function onExchange(userText: string, asked: string) {
    const id = `turn-${Object.keys(clarifyAnswers).length + 1}`;
    setClarifyPrompts((prev) => ({ ...prev, [id]: asked || "Trip notes" }));
    setClarifyAnswers((prev) => ({ ...prev, [id]: userText }));
    noteFromChat(userText);
    const knownBrand = userText.match(
      /\b(westin|marriott|hilton|hyatt|sheraton|holiday inn|four seasons|ritz(?:-carlton)?|intercontinental|novotel|ibis|kimpton|waldorf|accor|radisson|sofitel|pullman|mercure)\b/i,
    );
    const named = userText.match(
      /\b(?:brand|prefer|like)\s+(?:the\s+)?([A-Za-z][A-Za-z'&.\- ]{1,40})/i,
    );
    const brand = (knownBrand?.[1] || named?.[1] || "").trim();
    if (/\b(already booked|i booked|we booked|have a reservation)\b/i.test(userText)) {
      setLegs((prev) =>
        prev.map((leg, index) => (index === 0 ? { ...leg, hotelBooked: true } : leg)),
      );
    } else if (brand) {
      setLegs((prev) =>
        prev.map((leg, index) =>
          index === 0 ? { ...leg, hotelBrand: brand, hotelBooked: false } : leg,
        ),
      );
    }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setPlanLimited(false);
    setProgress("Saving trip…");
    try {
      const created = countCreatedOfflineTrips();
      const gate = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", created }),
      }).then((res) => res.json());
      if (gate.plan !== "pro" && gate.remaining === 0) {
        setPlanLimited(true);
        setError(PLAN_LIMIT_MESSAGE);
        setLoading(false);
        setProgress("");
        return;
      }
    } catch {
      /* the create route still enforces the cap */
    }
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
      preferredAirlines: form.preferredAirlines.trim() || undefined,
      flightPricePoint: form.flightPricePoint,
      chosenAirline: form.chosenAirline || undefined,
      idealTrip: [
        form.idealTrip.trim(),
        legs
          .filter((l) => !l.hotelBooked && l.hotel.trim())
          .map(
            (l) =>
              `Build the ${l.city} days around ${l.hotel.trim()}${
                l.hotelBrand.trim() ? ` (${l.hotelBrand.trim()})` : ""
              }. Do not switch to a different hotel.`,
          )
          .join("\n"),
        form.chosenAirline
          ? `Inbound flight preference: ${form.chosenAirline}. Price point: ${form.flightPricePoint}. Do not invent a fare or a booking.`
          : form.preferredAirlines.trim() || form.flightPricePoint !== "any"
            ? `Flight restrictions: airlines ${form.preferredAirlines.trim() || "any"}, price point ${form.flightPricePoint}. Use only a published match. Do not invent a fare.`
            : "",
        Object.entries(clarifyAnswers)
          .map(([id, answer]) => {
            const trimmed = answer.trim();
            return trimmed ? `Q: ${clarifyPrompts[id] ?? id}\nA: ${trimmed}` : "";
          })
          .filter(Boolean)
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
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
          hotelBooked: l.hotelBooked,
          hotelMinRating: l.hotelMinRating,
          hotelPlace: l.hotelPlace,
          hotelBrand: l.hotelBrand.trim() || undefined,
          hotelAddress: l.hotelAddress,
          transitFromPrevious:
            i === 0 ? undefined : l.transitFromPrevious || "auto",
        })),
    };

    if (previewMode) {
      try {
        setProgress("Generating itinerary…");
        const res = await fetch("/api/trips/demo-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "plan_limit") setPlanLimited(true);
          throw new Error(data.error ?? "Could not generate this trip");
        }
        const tripId = createOfflineTripId();
        saveOfflineTrip(
          offlineSnapshotFromGenerated({
            tripId,
            destination: data.destination || destination || "Untitled trip",
            startDate: form.startDate,
            endDate,
            days: (data.days ?? []) as GeneratedDay[],
            legs: body.legs,
          }),
        );
        router.push(`/trips/${tripId}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate this trip");
      } finally {
        setLoading(false);
        setProgress("");
      }
      return;
    }

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
        legs: body.legs.map((l) => ({
          city: l.city,
          days: l.days,
          hotel: l.hotel,
          geonameId: l.geonameId,
          lat: l.lat,
          lng: l.lng,
          countryCode: l.countryCode,
          hotelLat: l.hotelLat,
          hotelLng: l.hotelLng,
          hotelPlaceId: l.hotelPlaceId,
          hotelAddress: l.hotelAddress,
          hotelBooked: l.hotelBooked,
          hotelMinRating: l.hotelMinRating,
          hotelPlace: l.hotelPlace,
          transitFromPrevious: l.transitFromPrevious,
        })),
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
      if (!res.ok) {
        if (data.code === "plan_limit") setPlanLimited(true);
        throw new Error(data.error ?? "Failed");
      }
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

  const firstLeg = legs[0];

  return (
    <TripAgentDesk
      city={firstLeg?.city ?? ""}
      days={firstLeg?.days ?? 3}
      startDate={form.startDate}
      endDate={endDate}
      suggestions={(citySuggestions[0] ?? []).map((c) => ({
        key: String(c.id),
        label: c.label,
      }))}
      onCityInput={(value) => {
        setLegs((prev) =>
          prev.map((leg, index) => (index === 0 ? { ...leg, city: value } : leg)),
        );
        void searchCities(0, value);
      }}
      onPickSuggestion={(index) => {
        const city = citySuggestions[0]?.[index];
        if (city) pickCity(0, city);
      }}
      onDays={(days) =>
        setLegs((prev) =>
          prev.map((leg, index) => (index === 0 ? { ...leg, days } : leg)),
        )
      }
      onStartDate={(startDate) => setForm((current) => ({ ...current, startDate }))}
      travelers={form.travelers}
      onTravelers={(travelers) => setForm((current) => ({ ...current, travelers }))}
      intensity={form.intensity}
      onIntensity={(intensity) => setForm((current) => ({ ...current, intensity }))}
      transport={form.transport}
      onTransport={(transport) => setForm((current) => ({ ...current, transport }))}
      party={party}
      destination={firstLeg?.city ?? ""}
      cities={legs.map((leg) => leg.city)}
      interests={form.interests}
      idealTrip={form.idealTrip}
      onExchange={onExchange}
      canGenerate={canGenerate}
      loading={loading}
      progress={progress}
      error={error}
      onGenerate={() => void submit()}
      hotel={
        firstLeg?.city.trim() ? (
          <div className="space-y-2 border-t border-[#F0F2F8] pt-3">
            <HotelChoice
              city={firstLeg.city}
              booked={firstLeg.hotelBooked}
              minRating={firstLeg.hotelMinRating}
              place={firstLeg.hotelPlace}
              brand={firstLeg.hotelBrand}
              selectedName={firstLeg.hotel}
              onBooked={(hotelBooked) =>
                setLegs((prev) =>
                  prev.map((leg, index) => (index === 0 ? { ...leg, hotelBooked } : leg)),
                )
              }
              onBrand={(hotelBrand) =>
                setLegs((prev) =>
                  prev.map((leg, index) => (index === 0 ? { ...leg, hotelBrand } : leg)),
                )
              }
              onClear={() =>
                setLegs((prev) =>
                  prev.map((leg, index) =>
                    index === 0
                      ? {
                          ...leg,
                          hotel: "",
                          hotelAddress: undefined,
                          hotelLat: undefined,
                          hotelLng: undefined,
                          hotelPlaceId: undefined,
                        }
                      : leg,
                  ),
                )
              }
              onMinRating={(hotelMinRating) =>
                setLegs((prev) =>
                  prev.map((leg, index) =>
                    index === 0 ? { ...leg, hotelMinRating } : leg,
                  ),
                )
              }
              onPlace={(hotelPlace) =>
                setLegs((prev) =>
                  prev.map((leg, index) => (index === 0 ? { ...leg, hotelPlace } : leg)),
                )
              }
              onPick={(hotel) =>
                setLegs((prev) =>
                  prev.map((leg, index) =>
                    index === 0
                      ? {
                          ...leg,
                          hotel: hotel.name,
                          hotelAddress: hotel.location,
                          hotelBooked: false,
                          hotelLat: hotel.lat,
                          hotelLng: hotel.lng,
                          hotelPlaceId: hotel.id,
                        }
                      : leg,
                  ),
                )
              }
              onResults={(hotels) => setRecLists((prev) => ({ ...prev, 0: hotels }))}
            />
            {firstLeg.hotelBooked ? (
              <CityHotelField
                city={firstLeg.city}
                value={firstLeg.hotel}
                lat={firstLeg.lat}
                lng={firstLeg.lng}
                onChange={(next) =>
                  setLegs((prev) =>
                    prev.map((leg, index) =>
                      index === 0
                        ? {
                            ...leg,
                            hotel: next.hotel,
                            hotelLat: next.hotelLat,
                            hotelLng: next.hotelLng,
                            hotelPlaceId: next.hotelPlaceId,
                            hotelAddress: next.hotelAddress,
                          }
                        : leg,
                    ),
                  )
                }
              />
            ) : firstLeg.hotel ? (
              <p className="text-xs text-[#080B3A]">
                Planning around <span className="font-semibold">{firstLeg.hotel}</span>
              </p>
            ) : null}
          </div>
        ) : null
      }
      flights={
        <div className="space-y-2 border-t border-[#F0F2F8] pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <Label>From</Label>
              <Input
                value={form.originAirport}
                onChange={(e) => {
                  const originAirport = e.target.value.toUpperCase();
                  setForm((current) => ({ ...current, originAirport }));
                  void searchAirportsFor("origin", originAirport, departureCoords);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    void refreshFlightEstimate();
                    setOriginAirportSuggestions([]);
                  }, 150);
                }}
                className="mt-1"
                placeholder="SEA"
                autoComplete="off"
              />
              <SuggestionList
                items={originAirportSuggestions.map((a) => ({
                  key: a.iata + a.name,
                  label: a.label,
                }))}
                onPick={(index) => pickAirport("origin", originAirportSuggestions[index])}
              />
            </div>
            <div className="relative">
              <Label>To</Label>
              <Input
                value={form.destinationAirport}
                onChange={(e) => {
                  const destinationAirport = e.target.value.toUpperCase();
                  setForm((current) => ({ ...current, destinationAirport }));
                  const near =
                    firstLeg?.lat != null && firstLeg?.lng != null
                      ? { lat: firstLeg.lat, lng: firstLeg.lng }
                      : null;
                  void searchAirportsFor("dest", destinationAirport, near);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    void refreshFlightEstimate();
                    setDestAirportSuggestions([]);
                  }, 150);
                }}
                className="mt-1"
                placeholder="CDG"
                autoComplete="off"
              />
              <SuggestionList
                items={destAirportSuggestions.map((a) => ({
                  key: a.iata + a.name,
                  label: a.label,
                }))}
                onPick={(index) => pickAirport("dest", destAirportSuggestions[index])}
              />
            </div>
          </div>
          {flightHint ? (
            <p className="text-[11px] leading-snug text-[#6B7280]">{flightHint}</p>
          ) : (
            <p className="text-[11px] text-[#6B7280]">
              Optional. Airlines come from the published route. No fare is shown.
            </p>
          )}
          <FlightRestrictions
            airlines={routeAirlines}
            preferred={form.preferredAirlines}
            pricePoint={form.flightPricePoint}
            chosen={form.chosenAirline}
            onPreferred={(preferredAirlines) =>
              setForm((current) => ({ ...current, preferredAirlines }))
            }
            onPricePoint={(flightPricePoint) =>
              setForm((current) => ({ ...current, flightPricePoint }))
            }
            onChoose={(chosenAirline) =>
              setForm((current) => ({ ...current, chosenAirline }))
            }
          />
        </div>
      }
    />
  );
}

const PRICE_POINTS: { value: PricePoint; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "budget", label: "Budget" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
];

function FlightRestrictions({
  airlines,
  preferred,
  pricePoint,
  chosen,
  onPreferred,
  onPricePoint,
  onChoose,
}: {
  airlines: AirlineOption[];
  preferred: string;
  pricePoint: PricePoint;
  chosen: string;
  onPreferred: (value: string) => void;
  onPricePoint: (value: PricePoint) => void;
  onChoose: (value: string) => void;
}) {
  const matches = filterAirlines(airlines, { airlines: preferred, pricePoint });
  return (
    <div className="space-y-3 rounded-[12px] border border-[#E1E5F0] bg-[#F5F7FF] p-3">
      <div>
        <Label>Airlines</Label>
        <Input
          value={preferred}
          onChange={(e) => onPreferred(e.target.value)}
          className="mt-1 bg-white"
          placeholder="Delta, ANA, or leave blank"
        />
      </div>
      <div>
        <Label>Price point</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PRICE_POINTS.map((point) => (
            <button
              key={point.value}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                pricePoint === point.value
                  ? "bg-[#0400FF] text-white"
                  : "bg-white text-[#0400FF]"
              }`}
              onClick={() => onPricePoint(point.value)}
            >
              {point.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">
          Budget, standard, and premium keep airlines of that kind on the
          published route. No fare is shown.
        </p>
      </div>
      {matches.length ? (
        <div className="flex flex-wrap gap-1.5">
          {matches.slice(0, 6).map((airline) => {
            const selected = chosen === airline.name;
            return (
              <button
                key={airline.code}
                type="button"
                className={`rounded-[10px] border px-2.5 py-1 text-left text-xs ${
                  selected
                    ? "border-[#0400FF] bg-white font-semibold text-[#080B3A]"
                    : "border-[#E1E5F0] bg-white text-[#1F2937]"
                }`}
                onClick={() => onChoose(selected ? "" : airline.name)}
              >
                {airline.name}
              </button>
            );
          })}
        </div>
      ) : airlines.length ? (
        <p className="text-[11px] text-[#6B7280]">
          No airline on this route matches those restrictions.
        </p>
      ) : (
        <p className="text-[11px] text-[#6B7280]">
          Enter both airports to see airlines that fly the route.
        </p>
      )}
    </div>
  );
}


function splitList(s: string) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
