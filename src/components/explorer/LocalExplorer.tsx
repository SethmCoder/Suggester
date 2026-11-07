"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { TripMap } from "@/components/itinerary/TripMap";
import { IconSearch } from "@/components/ui/Icons";
import { addPlaceToOfflineTrip } from "@/lib/explorer/add-offline";
import { EXPLORER_CATEGORIES, type ExplorerCategory, type ExplorerDay, type ExplorerPlace, type ExplorerPreferences, type ExplorerResult } from "@/lib/explorer/types";
import { emptyPreferences } from "@/lib/explorer/validate";
import { formatTripDate } from "@/lib/format-date";
import { listOfflineTrips } from "@/lib/offline/trips";
import type { TripListItem } from "@/lib/types/trip";
import { saveWishlistItem } from "@/lib/wishlist/sync";
import type { WishlistCategory } from "@/lib/wishlist/types";

const PROMPTS = [
  "Find the best restaurants in this city.",
  "Show me interesting hidden gems.",
  "Find unique architectural attractions.",
  "Recommend activities for a family.",
  "Find places near my hotel.",
  "Find interesting things to do that are free.",
  "Recommend places based on my existing itinerary.",
];

const CATEGORY_LABEL: Record<ExplorerCategory, string> = {
  restaurants: "Restaurants",
  attractions: "Attractions",
  architecture: "Architecture",
  museums: "Museums",
  nature: "Nature",
  shopping: "Shopping",
  entertainment: "Entertainment",
  hidden: "Hidden gems",
};

type ChatLine = { role: "user" | "assistant"; text: string };
type TripChoice = TripListItem;

function dayChoices(trip: TripChoice) {
  const start = trip.start_date?.slice(0, 10);
  const end = trip.end_date?.slice(0, 10);
  if (!start || !end) return [{ index: 0, label: "Day 1" }];
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const from = new Date(ys, ms - 1, ds);
  const to = new Date(ye, me - 1, de);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  return Array.from({ length: Math.min(days, 21) }, (_, index) => {
    const date = new Date(ys, ms - 1, ds + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { index, label: `Day ${index + 1} · ${formatTripDate(iso, "short")}` };
  });
}

export function LocalExplorer() {
  const searchParams = useSearchParams();
  const [city, setCity] = useState("");
  const [draft, setDraft] = useState("");
  const [budget, setBudget] = useState("any");
  const [categories, setCategories] = useState<ExplorerCategory[]>([]);
  const [thread, setThread] = useState<ChatLine[]>([]);
  const [places, setPlaces] = useState<ExplorerPlace[]>([]);
  const [plan, setPlan] = useState<ExplorerDay[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<ExplorerPreferences>(emptyPreferences());
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [addPlace, setAddPlace] = useState<ExplorerPlace | null>(null);
  const [trips, setTrips] = useState<TripChoice[]>([]);
  const [tripId, setTripId] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [startTime, setStartTime] = useState("11:00");
  const [addStatus, setAddStatus] = useState<string | null>(null);

  const selectedTrip = trips.find((trip) => trip.id === tripId) ?? null;
  const days = selectedTrip ? dayChoices(selectedTrip) : [];

  useEffect(() => {
    const fromQuery = searchParams.get("city")?.trim();
    if (fromQuery) setCity(fromQuery);
  }, [searchParams]);

  const pins = useMemo(
    () =>
      places.map((place, index) => ({
        lat: place.lat,
        lng: place.lng,
        label: place.name,
        order: index + 1,
        starred: place.id === selectedId,
        address: place.address,
        activityId: place.id,
      })),
    [places, selectedId],
  );

  function toggleCategory(category: ExplorerCategory) {
    setCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  async function ask(text: string) {
    const message = text.trim();
    if (!message || status === "loading") return;
    setDraft("");
    setError(null);
    setStatus("loading");
    setThread((current) => [...current, { role: "user", text: message }]);
    try {
      const res = await fetch("/api/explorer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          city,
          categories,
          budget,
          tripId: tripId || undefined,
          history: thread.slice(-6),
          preferences,
          previousPlaces: places,
        }),
      });
      const data = (await res.json()) as ExplorerResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "The search did not finish.");
      setThread((current) => [...current, { role: "assistant", text: data.reply }]);
      setPlaces(data.places);
      setPlan(data.plan);
      setFollowUps(data.followUps);
      setPreferences(data.preferences);
      setNotice(data.notice);
      if (data.city) setCity(data.city);
      setSelectedId(data.places[0]?.id ?? null);
      setStatus("idle");
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "The search did not finish.");
    }
  }

  async function openAdd(place: ExplorerPlace) {
    setAddPlace(place);
    setAddStatus(null);
    const offline = listOfflineTrips();
    let remote: TripChoice[] = [];
    try {
      const res = await fetch("/api/trips");
      const data = (await res.json()) as { trips?: TripChoice[] };
      remote = data.trips ?? [];
    } catch {
      remote = [];
    }
    const merged = [...remote];
    for (const trip of offline) {
      if (!merged.some((item) => item.id === trip.id)) merged.push(trip);
    }
    setTrips(merged);
    setTripId((current) => current || merged[0]?.id || "");
  }

  async function confirmAdd() {
    if (!addPlace || !tripId) return;
    setAddStatus(null);
    const local = tripId.startsWith("offline-") || tripId.startsWith("demo-");
    if (local) {
      const result = addPlaceToOfflineTrip({ tripId, dayIndex, startTime, place: addPlace });
      setAddStatus("error" in result ? result.error : "Added. Open the trip to see it on the map.");
      return;
    }
    const res = await fetch("/api/explorer/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        dayIndex,
        startTime,
        place: {
          id: addPlace.id,
          name: addPlace.name,
          address: addPlace.address,
          lat: addPlace.lat,
          lng: addPlace.lng,
          category: addPlace.category,
          mapsUrl: addPlace.mapsUrl,
          photoName: addPlace.photoName,
          hours: addPlace.hours,
          why: addPlace.why,
        },
      }),
    });
    const data = (await res.json()) as { error?: string };
    setAddStatus(res.ok ? "Added. Open the trip to see it on the map." : data.error || "Could not add this place.");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0400FF]">Local Explorer AI</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#080B3A]">Explore your destination.</h1>
          <p className="mt-1 text-sm text-[#4B5563]">Discover places, experiences, and hidden gems.</p>
        </div>
      </div>

      <section className="rounded-[20px] border border-[#D7DEFF] bg-white/80 p-4 shadow-[0_16px_40px_rgba(8,11,58,0.06)] backdrop-blur">
        <label className="block text-xs font-medium text-[#080B3A]">
          City
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Tokyo"
            className="mt-1 h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-[#F5F7FF] px-3 text-sm focus:border-[#0400FF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0400FF]/25"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXPLORER_CATEGORIES.map((category) => {
            const on = categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on ? "border-[#0400FF] bg-[#0400FF] text-white" : "border-[#D7DEFF] bg-[#F5F7FF] text-[#080B3A] hover:border-[#0400FF]"
                }`}
              >
                {CATEGORY_LABEL[category]}
              </button>
            );
          })}
          <label className="ml-auto flex items-center gap-2 text-xs text-[#4B5563]">
            Budget
            <select
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              className="h-8 rounded-full border border-[#D7DEFF] bg-white px-2"
            >
              <option value="any">Any</option>
              <option value="free">Free</option>
              <option value="$">$</option>
              <option value="$$">$$</option>
              <option value="$$$">$$$</option>
            </select>
          </label>
        </div>
        <div className="mt-3 rounded-[16px] border border-[#C9D2FF] bg-[#080B3A] p-3 focus-within:shadow-[0_0_0_3px_rgba(4,0,255,0.25)]">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="Tell me what you want to discover in Tokyo..."
            className="w-full resize-none bg-transparent text-sm text-white placeholder:text-[#9AA3D6] focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9AA3D6]">
              <IconSearch size={14} />
              Local Explorer AI
            </span>
            <button
              type="button"
              disabled={status === "loading" || !draft.trim()}
              onClick={() => void ask(draft)}
              className="rounded-full bg-[#0400FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0200C8] disabled:opacity-50"
            >
              {status === "loading" ? "Searching…" : "Search"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void ask(prompt)}
              className="shrink-0 rounded-full border border-[#D7DEFF] bg-white px-3 py-1.5 text-[11px] text-[#080B3A] hover:border-[#0400FF]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {status === "loading" ? (
        <p className="mt-4 text-sm text-[#0400FF]" role="status">
          Discovering places that match your interests…
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-[#DC2626]">{error}</p> : null}
      {notice ? <p className="mt-4 text-xs text-[#4B5563]">{notice}</p> : null}

      {thread.length ? (
        <div className="mt-4 space-y-2">
          {thread.slice(-4).map((line, index) => (
            <p
              key={`${line.role}-${index}`}
              className={`max-w-3xl rounded-[14px] px-3 py-2 text-sm leading-relaxed ${
                line.role === "user" ? "ml-auto bg-[#0400FF] text-white" : "border border-[#E1E5F0] bg-white text-[#1F2937]"
              }`}
            >
              {line.text}
            </p>
          ))}
        </div>
      ) : null}

      {plan.length ? (
        <section className="mt-5 space-y-3">
          {plan.map((day, index) => (
            <article key={day.title + index} className="rounded-[16px] border border-[#E1E5F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-[#080B3A]">Day {index + 1} · {day.title}</h2>
              <ul className="mt-2 space-y-1 text-sm text-[#1F2937]">
                {day.stops.map((stop) => {
                  const place = places.find((item) => item.id === stop.placeId);
                  return (
                    <li key={stop.placeId}>
                      <button type="button" className="text-left hover:text-[#0400FF]" onClick={() => setSelectedId(stop.placeId)}>
                        {stop.startTime} · {place?.name || "Place"} · {stop.durationMinutes} min
                        {stop.travelMinutes ? ` · about ${stop.travelMinutes} min between stops (estimate)` : ""}
                      </button>
                      {stop.note ? <span className="block text-xs text-[#6B7280]">{stop.note}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </section>
      ) : null}

      <div className="mt-4 flex gap-2 lg:hidden">
        <button type="button" className={`rounded-full px-3 py-1 text-xs ${mobileView === "list" ? "bg-[#0400FF] text-white" : "bg-white"}`} onClick={() => setMobileView("list")}>List</button>
        <button type="button" className={`rounded-full px-3 py-1 text-xs ${mobileView === "map" ? "bg-[#0400FF] text-white" : "bg-white"}`} onClick={() => setMobileView("map")}>Map</button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div className={`grid gap-3 sm:grid-cols-2 ${mobileView === "map" ? "hidden lg:grid" : ""}`}>
          {places.map((place) => (
            <article
              id={`place-${place.id}`}
              key={place.id}
              className={`overflow-hidden rounded-[16px] border bg-white shadow-[0_8px_24px_rgba(8,11,58,0.05)] transition hover:-translate-y-0.5 motion-reduce:transform-none ${
                selectedId === place.id ? "border-[#0400FF]" : "border-[#E1E5F0]"
              }`}
            >
              <button type="button" className="block w-full text-left" onClick={() => setSelectedId(place.id)}>
                <div className="h-36 overflow-hidden bg-[#080B3A]">
                  {place.photoName ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/places/photo?name=${encodeURIComponent(place.photoName)}`} alt="" className="h-full w-full object-cover transition duration-300 hover:scale-105 motion-reduce:transform-none" />
                  ) : (
                    <div className="flex h-full items-end px-3 py-3 text-sm font-semibold text-white">{place.name}</div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[#0400FF]">{place.category}</p>
                  <h3 className="text-base font-semibold text-[#080B3A]">{place.name}</h3>
                  <p className="text-xs text-[#6B7280]">{place.address || "Address unavailable"}</p>
                  <p className="text-xs text-[#374151]">
                    {place.rating != null ? `${place.rating.toFixed(1)}` : "Rating unavailable"}
                    {place.reviewCount != null ? ` · ${place.reviewCount} reviews` : ""}
                    {place.priceLevel ? ` · ${place.priceLevel}` : ""}
                  </p>
                  {place.hours ? <p className="text-xs text-[#374151]">{place.hours}</p> : null}
                  {place.why ? <p className="text-sm leading-relaxed text-[#1F2937]">{place.why}</p> : null}
                </div>
              </button>
              <div className="flex gap-2 px-3 pb-3">
                {place.mapsUrl ? (
                  <a href={place.mapsUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#D7DEFF] px-3 py-1 text-xs font-medium text-[#0400FF]">
                    {place.source === "google" ? "View on Google Maps" : "View on map"}
                  </a>
                ) : null}
                <button type="button" onClick={() => void openAdd(place)} className="rounded-full bg-[#0400FF] px-3 py-1 text-xs font-semibold text-white">
                  Add to itinerary
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const categoryMap: Record<string, WishlistCategory> = {
                      restaurants: "restaurant",
                      attractions: "attraction",
                      architecture: "attraction",
                      museums: "museum",
                      nature: "outdoor",
                      shopping: "experience",
                    };
                    void saveWishlistItem({
                      name: place.name,
                      lat: place.lat,
                      lng: place.lng,
                      address: place.address,
                      location: city || null,
                      category: categoryMap[place.category] || "attraction",
                      description: place.why || null,
                      photoUrl: place.photoName
                        ? `/api/places/photo?name=${encodeURIComponent(place.photoName)}`
                        : null,
                      sourceUrl: place.mapsUrl || null,
                      externalPlaceId: place.id,
                      estimatedPrice: place.priceLevel || null,
                      priority: "medium",
                    });
                  }}
                  className="rounded-full border border-[#D7DEFF] px-3 py-1 text-xs font-medium text-[#0400FF]"
                >
                  Save to Wishlist
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className={`min-h-[420px] overflow-hidden rounded-[16px] border border-[#E1E5F0] ${mobileView === "list" ? "hidden lg:block" : ""}`}>
          {places.length ? (
            <TripMap
              pins={pins}
              onSelectPin={(pin) => {
                if (pin.activityId) setSelectedId(pin.activityId);
              }}
            />
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center bg-[#080B3A] px-6 text-center text-sm text-[#C5CAE5]">
              Search a city to place recommendations on the map.
            </div>
          )}
        </div>
      </div>

      {followUps.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {followUps.map((prompt) => (
            <button key={prompt} type="button" onClick={() => void ask(prompt)} className="rounded-full bg-[#DDE1FF] px-3 py-1 text-xs text-[#0400FF]">
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      {addPlace ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#080B3A]/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[16px] bg-white p-4 shadow-xl">
            <h2 className="text-base font-semibold text-[#080B3A]">Add {addPlace.name}</h2>
            <label className="mt-3 block text-xs font-medium text-[#080B3A]">
              Trip
              <select value={tripId} onChange={(event) => setTripId(event.target.value)} className="mt-1 h-10 w-full rounded-[10px] border border-[#D1D7E5] px-2 text-sm">
                {trips.length ? null : <option value="">No trips yet</option>}
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>{trip.destination}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-medium text-[#080B3A]">
              Day
              <select value={dayIndex} onChange={(event) => setDayIndex(Number(event.target.value))} className="mt-1 h-10 w-full rounded-[10px] border border-[#D1D7E5] px-2 text-sm">
                {days.map((day) => (
                  <option key={day.index} value={day.index}>{day.label}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-medium text-[#080B3A]">
              Time
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 h-10 w-full rounded-[10px] border border-[#D1D7E5] px-2 text-sm" />
            </label>
            {addStatus ? <p className="mt-3 text-sm text-[#1F2937]">{addStatus}</p> : null}
            {addStatus?.startsWith("Added") && tripId ? (
              <Link href={`/trips/${tripId}`} className="mt-2 inline-block text-sm font-medium text-[#0400FF]">Open trip</Link>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-full px-3 py-1.5 text-sm text-[#4B5563]" onClick={() => setAddPlace(null)}>Close</button>
              <button type="button" className="rounded-full bg-[#0400FF] px-3 py-1.5 text-sm font-semibold text-white" onClick={() => void confirmAdd()}>Add</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
