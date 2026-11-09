"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  countCreatedOfflineTrips,
  createOfflineTripId,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import { PLAN_LIMIT_MESSAGE } from "@/lib/billing/plans";
import { offlineSnapshotFromGenerated } from "@/lib/trips/offline-from-generated";
import { budgetFromConversation } from "@/lib/trips/budget";
import { constraintsFromConversation } from "@/lib/ai/constraints";
import { readPlaceFeedback } from "@/lib/trips/place-feedback";
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
import type { LegTransitMode } from "@/lib/types/trip";
import { getFutureTrip, updateFutureTrip } from "@/lib/future-trips/store";
import { itemsForDestination, getItem } from "@/lib/wishlist/store";
import type { WishlistItem } from "@/lib/wishlist/types";
import {
  effectiveInterests,
  readIntelligence,
} from "@/lib/intelligence/store";
import {
  idealTripWithMajorStops,
  mergeTripStops,
} from "@/lib/trips/major-stops";
import {
  addCalendarDays,
  assertValidDateRange,
  nightsBetween,
} from "@/lib/trips/dates";
import type { PlanningClarity, TravelerMode } from "@/lib/types/trip";

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
  country?: string;
  days: number;
  arrivalDate?: string;
  departureDate?: string;
  nights?: number;
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

function emptyLeg(partial?: Partial<LegDraft>): LegDraft {
  return {
    city: "",
    days: 3,
    hotel: "",
    transitFromPrevious: "auto",
    hotelBooked: false,
    hotelMinRating: 4,
    hotelPlace: "center",
    hotelBrand: "",
    ...partial,
  };
}

function legWithDates(
  leg: LegDraft,
  arrivalDate: string,
  departureDate: string,
): LegDraft {
  const nights = nightsBetween(arrivalDate, departureDate);
  return {
    ...leg,
    arrivalDate,
    departureDate,
    nights,
    days: Math.max(1, nights + 1),
  };
}

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
  const searchParams = useSearchParams();
  const futureTripId = searchParams.get("future");
  const destinationParam = searchParams.get("destination");
  const daysParam = searchParams.get("days");
  const [wishlistSuggestions, setWishlistSuggestions] = useState<WishlistItem[]>(
    [],
  );
  const [acceptedWishlistIds, setAcceptedWishlistIds] = useState<string[]>([]);
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
    endDate: "",
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
    tripTitle: "",
    prefersHiddenGems: false,
    preferredAirlines: "",
    flightPricePoint: "any" as PricePoint,
    chosenAirline: "",
    travelerMode: "" as TravelerMode | "",
    planningClarity: "" as PlanningClarity | "",
  });
  const [routeAirlines, setRouteAirlines] = useState<AirlineOption[]>([]);
  const [majorStops, setMajorStops] = useState<string[]>([]);
  const [legs, setLegs] = useState<LegDraft[]>([emptyLeg()]);
  const futureLoaded = useRef(false);

  useEffect(() => {
    if (destinationParam && !futureTripId && !futureLoaded.current) {
      futureLoaded.current = true;
      const days = Math.max(1, Number(daysParam) || 5);
      setLegs([
        {
          city: destinationParam,
          days,
          hotel: "",
          transitFromPrevious: "auto",
          hotelBooked: false,
          hotelMinRating: 4,
          hotelPlace: "center",
          hotelBrand: "",
        },
      ]);
      setForm((current) => ({
        ...current,
        startDate:
          current.startDate ||
          new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      }));
    }
  }, [destinationParam, daysParam, futureTripId]);

  useEffect(() => {
    if (!futureTripId || futureLoaded.current) return;
    const trip = getFutureTrip(futureTripId);
    if (!trip) return;
    futureLoaded.current = true;
    const days = Math.max(1, trip.estimatedDurationDays || 3);
    const start =
      trip.potentialStart ||
      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    setForm((current) => ({
      ...current,
      tripTitle: trip.title || current.tripTitle,
      startDate: start,
      travelers: trip.travelers || current.travelers,
      budget: trip.budget != null ? String(trip.budget) : current.budget,
      currency: trip.currency || current.currency,
      interests: trip.interests.length ? trip.interests : current.interests,
      transport: trip.transport || current.transport,
      idealTrip: trip.notes || current.idealTrip,
      mustSee: current.mustSee,
      preferred: current.preferred,
    }));
    setLegs([
      {
        city: trip.destination,
        days,
        hotel: "",
        transitFromPrevious: "auto",
        hotelBooked: false,
        hotelMinRating: 4,
        hotelPlace: "center",
        hotelBrand: "",
      },
    ]);
    const linked = trip.wishlistItemIds
      .map((id) => getItem(id))
      .filter((item): item is WishlistItem => Boolean(item));
    const nearby = itemsForDestination(trip.destination);
    const merged = [...linked];
    for (const item of nearby) {
      if (!merged.some((row) => row.id === item.id)) merged.push(item);
    }
    setWishlistSuggestions(merged);
  }, [futureTripId]);
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
  const [airportOpen, setAirportOpen] = useState<"origin" | "dest" | null>(null);
  const airportTimers = useRef<{
    origin?: ReturnType<typeof setTimeout>;
    dest?: ReturnType<typeof setTimeout>;
  }>({});

  const endDate = form.endDate;

  const tripNights = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    try {
      return nightsBetween(form.startDate, form.endDate);
    } catch {
      return 0;
    }
  }, [form.startDate, form.endDate]);

  function redistributeLegsFromTripDates(start: string, end: string) {
    if (!start || !end) return;
    try {
      assertValidDateRange(start, end);
    } catch {
      return;
    }
    setLegs((prev) => {
      if (!prev.length) return prev;
      const totalNights = nightsBetween(start, end);
      if (prev.length === 1) {
        return [legWithDates(prev[0], start, end)];
      }
      const base = Math.floor(totalNights / prev.length);
      const rem = totalNights % prev.length;
      let cursor = start;
      return prev.map((leg, i) => {
        const nights = base + (i < rem ? 1 : 0);
        const arrivalDate = cursor;
        const departureDate =
          i === prev.length - 1 ? end : addCalendarDays(arrivalDate, nights);
        cursor = departureDate;
        return legWithDates(leg, arrivalDate, departureDate);
      });
    });
  }

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
      if (!form.startDate || !form.endDate) {
        throw new Error("Choose an arrival and departure date.");
      }
      assertValidDateRange(form.startDate, form.endDate);
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
    const talked = budgetFromConversation(Object.values(clarifyAnswers).join("\n"));
    const feedback = readPlaceFeedback();
    const approved = wishlistSuggestions.filter((item) =>
      acceptedWishlistIds.includes(item.id),
    );
    const approvedMust = approved
      .filter((item) => item.priority === "high")
      .map((item) => item.name);
    const approvedPreferred = approved
      .filter((item) => item.priority !== "high")
      .map((item) => item.name);
    const stops = mergeTripStops({
      majorStops,
      mustSeeText: form.mustSee,
      preferredText: form.preferred,
      wishlistMust: approvedMust,
      wishlistPreferred: approvedPreferred,
    });
    const interestList = [
      ...new Set([
        ...form.interests,
        ...(form.customInterest ? [form.customInterest] : []),
        ...effectiveInterests(readIntelligence()),
      ]),
    ];
    const body = {
      destination,
      departureCity: form.departureCity,
      originAirport: form.originAirport || undefined,
      destinationAirport: form.destinationAirport || undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      travelers: form.travelers,
      budget: form.budget ? Number(form.budget) : talked.total,
      budgetAllocation: talked.allocation,
      restaurantStyle: talked.restaurantStyle,
      rejectedPlaceIds: feedback.removed,
      keptPlaceIds: feedback.added,
      ...constraintsFromConversation(Object.values(clarifyAnswers).join("\n"), interestList),
      travelerMode: form.travelerMode || undefined,
      planningClarity: form.planningClarity || undefined,
      party:
        form.travelerMode === "business"
          ? "business"
          : constraintsFromConversation(
              Object.values(clarifyAnswers).join("\n"),
              interestList,
            ).party,
      currency: form.currency,
      interests: interestList,
      intensity: form.intensity,
      transport: form.transport,
      hotel: legs[0]?.hotel || undefined,
      dietary: form.dietary,
      accessibility: form.accessibility,
      dayStart: form.dayStart,
      dayEnd: form.dayEnd,
      prefersHiddenGems: form.prefersHiddenGems,
      mustSee: stops.mustSee,
      preferred: stops.preferred,
      futureTripId: futureTripId || undefined,
      idempotencyKey: futureTripId
        ? `future:${futureTripId}`
        : `create:${form.startDate}:${form.endDate}:${legs.map((l) => l.city).join("|")}`,
      optional: splitList(form.optional),
      avoid: splitList(form.avoid),
      preferredAirlines: form.preferredAirlines.trim() || undefined,
      flightPricePoint: form.flightPricePoint,
      chosenAirline: form.chosenAirline || undefined,
      tripTitle: form.tripTitle.trim() || undefined,
      idealTrip: idealTripWithMajorStops(
        [
          form.tripTitle.trim() ? `Trip title: ${form.tripTitle.trim()}` : "",
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
        stops.mustSee,
      ),
      legs: legs
        .filter((l) => l.city.trim())
        .map((l, i) => ({
          city: l.city.trim(),
          country: l.country,
          days: Math.max(1, Number(l.days) || 1),
          arrivalDate: l.arrivalDate,
          departureDate: l.departureDate,
          nights: l.nights,
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
            endDate: form.endDate,
            days: (data.days ?? []) as GeneratedDay[],
            legs: body.legs,
            title: form.tripTitle.trim() || undefined,
            budget: {
              total: body.budget,
              currency: body.currency,
              allocation: body.budgetAllocation,
              restaurantStyle: body.restaurantStyle,
            },
          }),
        );
        if (futureTripId) {
          updateFutureTrip(futureTripId, {
            convertedTripId: tripId,
            status: "ready",
          });
        }
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

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("The planner needs a connection to look up real places.");
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
      if (futureTripId && data.tripId) {
        updateFutureTrip(futureTripId, {
          convertedTripId: data.tripId as string,
          status: "ready",
        });
        void fetch(`/api/future-trips/${futureTripId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            convertedTripId: data.tripId,
            status: "ready",
          }),
        });
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
                title:
                  (full.preferences as { title?: string } | undefined)?.title ||
                  form.tripTitle.trim() ||
                  undefined,
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
      setError(e instanceof Error ? e.message : "Could not generate this trip");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  const firstLeg = legs[0];

  return (
    <div className="space-y-4">
      {wishlistSuggestions.length ? (
        <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <h2 className="text-sm font-semibold text-[#080B3A]">
            Wishlist matches for this trip
          </h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Approve only the places you want considered. Nothing is inserted automatically.
          </p>
          <ul className="mt-3 space-y-2">
            {wishlistSuggestions.map((item) => {
              const checked = acceptedWishlistIds.includes(item.id);
              return (
                <li key={item.id} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => {
                      setAcceptedWishlistIds((current) =>
                        checked
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      );
                      if (item.priority === "high") {
                        setMajorStops((current) =>
                          checked
                            ? current.filter((name) => name !== item.name)
                            : current.includes(item.name)
                              ? current
                              : [...current, item.name].slice(0, 16),
                        );
                      }
                    }}
                  />
                  <div>
                    <p className="font-medium text-[#1F2937]">{item.name}</p>
                    <p className="text-xs text-[#6B7280]">
                      {item.category}
                      {item.location ? ` · ${item.location}` : ""}
                      {item.priority === "high" ? " · high priority" : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    <TripAgentDesk
      places={legs.map((leg, index) => ({
        city: leg.city,
        days: leg.days,
        arrivalDate: leg.arrivalDate,
        departureDate: leg.departureDate,
        nights: leg.nights,
        country: leg.country,
        suggestions: (citySuggestions[index] ?? []).map((c) => ({
          key: String(c.id),
          label: c.label,
        })),
      }))}
      tripTitle={form.tripTitle}
      onTripTitle={(tripTitle) => setForm((current) => ({ ...current, tripTitle }))}
      onCityInput={(index, value) => {
        setLegs((prev) =>
          prev.map((leg, i) => (i === index ? { ...leg, city: value } : leg)),
        );
        void searchCities(index, value);
      }}
      onPickSuggestion={(legIndex, suggestionIndex) => {
        const city = citySuggestions[legIndex]?.[suggestionIndex];
        if (city) pickCity(legIndex, city);
      }}
      onLegDays={(index, days) =>
        setLegs((prev) =>
          prev.map((leg, i) =>
            i === index
              ? {
                  ...leg,
                  days,
                  nights: Math.max(0, days - 1),
                }
              : leg,
          ),
        )
      }
      onLegDates={(index, dates) => {
        try {
          assertValidDateRange(dates.arrivalDate, dates.departureDate);
        } catch {
          return;
        }
        setLegs((prev) =>
          prev.map((leg, i) =>
            i === index
              ? legWithDates(leg, dates.arrivalDate, dates.departureDate)
              : leg,
          ),
        );
        if (index === 0) {
          setForm((current) => ({
            ...current,
            startDate: dates.arrivalDate,
            endDate:
              current.endDate && current.endDate >= dates.departureDate
                ? current.endDate
                : dates.departureDate,
          }));
        }
        if (index === legs.length - 1) {
          setForm((current) => ({
            ...current,
            endDate: dates.departureDate,
            startDate:
              current.startDate && current.startDate <= dates.arrivalDate
                ? current.startDate
                : dates.arrivalDate,
          }));
        }
      }}
      onAddCity={() => {
        setLegs((prev) => {
          const last = prev[prev.length - 1];
          const arrival =
            last?.departureDate || form.endDate || form.startDate || "";
          const departure = arrival
            ? addCalendarDays(arrival, 2)
            : "";
          const next = emptyLeg({
            days: 3,
            transitFromPrevious: "auto",
          });
          const withDates =
            arrival && departure ? legWithDates(next, arrival, departure) : next;
          if (departure) {
            setForm((current) => ({
              ...current,
              endDate:
                !current.endDate || departure > current.endDate
                  ? departure
                  : current.endDate,
            }));
          }
          return [...prev, withDates];
        });
      }}
      onRemoveCity={(index) =>
        setLegs((prev) => (prev.length < 2 ? prev : prev.filter((_, i) => i !== index)))
      }
      startDate={form.startDate}
      endDate={endDate}
      nights={tripNights}
      onStartDate={(startDate) => {
        setForm((current) => {
          const end =
            current.endDate && current.endDate >= startDate
              ? current.endDate
              : startDate
                ? addCalendarDays(startDate, Math.max(1, tripNights || 3))
                : current.endDate;
          if (startDate && end) redistributeLegsFromTripDates(startDate, end);
          return { ...current, startDate, endDate: end };
        });
      }}
      onEndDate={(nextEnd) => {
        setForm((current) => {
          if (current.startDate && nextEnd < current.startDate) return current;
          if (current.startDate && nextEnd) {
            redistributeLegsFromTripDates(current.startDate, nextEnd);
          }
          return { ...current, endDate: nextEnd };
        });
      }}
      travelers={form.travelers}
      onTravelers={(travelers) => setForm((current) => ({ ...current, travelers }))}
      intensity={form.intensity}
      onIntensity={(intensity) => setForm((current) => ({ ...current, intensity }))}
      transport={form.transport}
      onTransport={(transport) => setForm((current) => ({ ...current, transport }))}
      party={party}
      travelerMode={form.travelerMode}
      onTravelerMode={(travelerMode) =>
        setForm((current) => ({ ...current, travelerMode }))
      }
      planningClarity={form.planningClarity}
      onPlanningClarity={(planningClarity) =>
        setForm((current) => ({ ...current, planningClarity }))
      }
      destination={firstLeg?.city ?? ""}
      cities={legs.map((leg) => leg.city)}
      interests={[
        ...new Set([
          ...form.interests,
          ...(form.customInterest ? [form.customInterest] : []),
          ...effectiveInterests(readIntelligence()),
        ]),
      ]}
      majorStops={majorStops}
      onMajorStopsChange={setMajorStops}
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
        <div className="space-y-3 border-t border-[#F0F2F8] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
            Flight
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <Input
                value={form.originAirport}
                onChange={(e) => {
                  const originAirport = e.target.value.toUpperCase();
                  setForm((current) => ({ ...current, originAirport }));
                  void searchAirportsFor("origin", originAirport, departureCoords);
                }}
                onFocus={() => setAirportOpen("origin")}
                onBlur={() => {
                  window.setTimeout(() => {
                    void refreshFlightEstimate();
                    setOriginAirportSuggestions([]);
                    setAirportOpen((open) => (open === "origin" ? null : open));
                  }, 150);
                }}
                placeholder="From"
                aria-label="From airport"
                autoComplete="off"
              />
              {airportOpen === "origin" ? (
                <SuggestionList
                  items={originAirportSuggestions.map((a) => ({
                    key: a.iata + a.name,
                    label: a.label,
                  }))}
                  onPick={(index) => pickAirport("origin", originAirportSuggestions[index])}
                />
              ) : null}
            </div>
            <div className="relative">
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
                onFocus={() => setAirportOpen("dest")}
                onBlur={() => {
                  window.setTimeout(() => {
                    void refreshFlightEstimate();
                    setDestAirportSuggestions([]);
                    setAirportOpen((open) => (open === "dest" ? null : open));
                  }, 150);
                }}
                placeholder="To"
                aria-label="To airport"
                autoComplete="off"
              />
              {airportOpen === "dest" ? (
                <SuggestionList
                  items={destAirportSuggestions.map((a) => ({
                    key: a.iata + a.name,
                    label: a.label,
                  }))}
                  onPick={(index) => pickAirport("dest", destAirportSuggestions[index])}
                />
              ) : null}
            </div>
          </div>
          {flightHint ? (
            <p className="text-[11px] leading-snug text-[#6B7280]">{flightHint}</p>
          ) : null}
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
    </div>
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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PRICE_POINTS.map((point) => (
          <button
            key={point.value}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              pricePoint === point.value
                ? "bg-[#0400FF] text-white"
                : "bg-[#F5F7FF] text-[#0400FF]"
            }`}
            onClick={() => onPricePoint(point.value)}
          >
            {point.label}
          </button>
        ))}
      </div>
      {matches.length ? (
        <div className="flex flex-wrap gap-1.5">
          {matches.slice(0, 6).map((airline) => {
            const selected = chosen === airline.name;
            return (
              <button
                key={airline.code}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs ${
                  selected
                    ? "border-[#0400FF] bg-[#0400FF] font-semibold text-white"
                    : "border-[#E1E5F0] bg-white text-[#1F2937]"
                }`}
                onClick={() => onChoose(selected ? "" : airline.name)}
              >
                {airline.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        value={preferred}
        onChange={(e) => onPreferred(e.target.value)}
        className="w-full rounded-[12px] border border-[#D1D7E5] px-3 py-2 text-sm"
        placeholder="Or type an airline"
        aria-label="Airlines"
      />
    </div>
  );
}


function splitList(s: string) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
