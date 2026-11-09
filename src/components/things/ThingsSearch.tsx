"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TripMap } from "@/components/itinerary/TripMap";
import type { ExplorerPlace } from "@/lib/explorer/types";
import { addPlaceToOfflineTrip } from "@/lib/explorer/add-offline";
import { listOfflineTrips } from "@/lib/offline/trips";

type ChatLine = { role: "user" | "assistant"; text: string };

const PROMPTS = [
  "Museums in Tokyo",
  "Parks to walk in Kyoto",
  "Something outdoors in Lisbon",
  "A market in Mexico City",
];

export function ThingsSearch() {
  const searchParams = useSearchParams();
  const tripFromQuery = searchParams.get("trip");
  const [city, setCity] = useState("");
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<ChatLine[]>([]);
  const [places, setPlaces] = useState<ExplorerPlace[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"chat" | "map">("chat");
  const [addOpen, setAddOpen] = useState(false);
  const [tripId, setTripId] = useState(tripFromQuery ?? "");
  const [dayIndex, setDayIndex] = useState(0);
  const [startTime, setStartTime] = useState("10:00");
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [offlineTrips, setOfflineTrips] = useState<
    { id: string; destination: string }[]
  >([]);

  useEffect(() => {
    try {
      setOfflineTrips(
        listOfflineTrips().map((t) => ({
          id: t.id,
          destination: t.destination,
        })),
      );
    } catch {
      setOfflineTrips([]);
    }
  }, []);

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

  async function ask(text: string) {
    const message = text.trim();
    if (!message || status === "loading") return;
    setDraft("");
    setStatus("loading");
    setError(null);
    setThread((prev) => [...prev, { role: "user", text: message }]);
    try {
      const res = await fetch("/api/things", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, city }),
      });
      const data = (await res.json()) as {
        error?: string;
        reply?: string;
        city?: string;
        places?: ExplorerPlace[];
        notice?: string | null;
        center?: { lat: number; lng: number } | null;
      };
      if (!res.ok) throw new Error(data.error || "Could not search");
      if (data.city) setCity(data.city);
      setPlaces(data.places ?? []);
      setNotice(data.notice ?? null);
      setSelectedId(data.places?.[0]?.id ?? null);
      setThread((prev) => [...prev, { role: "assistant", text: data.reply || "No listed places came back." }]);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not search");
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-2 sm:px-6">
      <section className={`flex min-h-[70vh] flex-col rounded-[20px] border border-[#D7DEFF] bg-white p-4 shadow-[0_16px_40px_rgba(8,11,58,0.06)] ${mobileView === "map" ? "hidden lg:flex" : ""}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0400FF]">Things search</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#080B3A]">Find things to do</h1>
        <p className="mt-1 text-sm text-[#4B5563]">
          Discover places, then add them to a trip day with a time.
        </p>
        <label className="mt-3 block text-xs font-medium text-[#080B3A]">
          Area
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Tokyo"
            className="mt-1 h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-[#F5F7FF] px-3 text-sm focus:border-[#0400FF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0400FF]/25"
          />
        </label>
        <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {thread.map((line, index) => (
            <p
              key={`${line.role}-${index}`}
              className={`max-w-[90%] rounded-[14px] px-3 py-2 text-sm leading-relaxed ${
                line.role === "user" ? "ml-auto bg-[#0400FF] text-white" : "border border-[#E1E5F0] bg-[#F5F7FF] text-[#1F2937]"
              }`}
            >
              {line.text}
            </p>
          ))}
          {places.map((place) => (
            <div
              key={place.id}
              className={`rounded-[14px] border px-3 py-2 ${
                selectedId === place.id ? "border-[#0400FF]" : "border-[#E1E5F0]"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(place.id)}
                className="block w-full text-left"
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-[#0400FF]">{place.category}</span>
                <span className="mt-0.5 block text-sm font-semibold text-[#080B3A]">{place.name}</span>
                <span className="block text-xs text-[#6B7280]">{place.address || "Address unavailable"}</span>
                {place.priceLevel ? <span className="block text-xs text-[#374151]">{place.priceLevel}</span> : <span className="block text-xs text-[#6B7280]">Cost not listed</span>}
              </button>
              <button
                type="button"
                className="mt-2 rounded-full bg-[#0400FF] px-3 py-1 text-[11px] font-semibold text-white"
                onClick={() => {
                  setSelectedId(place.id);
                  setAddOpen(true);
                  setAddMessage(null);
                }}
              >
                Add to Itinerary
              </button>
            </div>
          ))}
        </div>
        {addOpen && selectedId ? (
          <div className="mt-3 space-y-2 rounded-[12px] border border-[#D7DEFF] bg-[#F5F7FF] p-3">
            <p className="text-sm font-semibold text-[#080B3A]">Add to itinerary</p>
            <label className="block text-xs">
              Trip id
              <input
                className="mt-1 h-9 w-full rounded-[8px] border border-[#D1D7E5] px-2 text-sm"
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                list="things-trip-options"
                placeholder="trip uuid or offline-…"
              />
              <datalist id="things-trip-options">
                {offlineTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.destination}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="block text-xs">
              City / area
              <input
                className="mt-1 h-9 w-full rounded-[8px] border border-[#D1D7E5] px-2 text-sm"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <label className="block flex-1 text-xs">
                Day index
                <input
                  type="number"
                  min={0}
                  className="mt-1 h-9 w-full rounded-[8px] border border-[#D1D7E5] px-2 text-sm"
                  value={dayIndex}
                  onChange={(e) => setDayIndex(Number(e.target.value) || 0)}
                />
              </label>
              <label className="block flex-1 text-xs">
                Time
                <input
                  type="time"
                  className="mt-1 h-9 w-full rounded-[8px] border border-[#D1D7E5] px-2 text-sm"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full bg-[#0400FF] px-3 py-1.5 text-xs font-semibold text-white"
                onClick={async () => {
                  const place = places.find((p) => p.id === selectedId);
                  if (!place || !tripId) {
                    setAddMessage("Pick a place and trip.");
                    return;
                  }
                  if (tripId.startsWith("offline-") || tripId.startsWith("demo-")) {
                    const result = addPlaceToOfflineTrip({
                      tripId,
                      dayIndex,
                      startTime,
                      place,
                    });
                    setAddMessage(
                      "ok" in result
                        ? "Added to itinerary."
                        : result.error,
                    );
                    return;
                  }
                  const res = await fetch("/api/explorer/add", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      tripId,
                      dayIndex,
                      startTime,
                      place,
                    }),
                  });
                  const data = await res.json();
                  setAddMessage(
                    res.ok
                      ? "Added to itinerary."
                      : data.error || "Could not add",
                  );
                }}
              >
                Confirm add
              </button>
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#6B7280]"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </button>
            </div>
            {addMessage ? (
              <p className="text-xs text-[#374151]">{addMessage}</p>
            ) : null}
          </div>
        ) : null}
        {notice ? <p className="mt-2 text-xs text-[#4B5563]">{notice}</p> : null}
        {error ? <p className="mt-2 text-sm text-[#DC2626]">{error}</p> : null}
        <div className="mt-3 flex gap-2 overflow-x-auto">
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
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What do you want to do?"
            className="h-11 flex-1 rounded-[12px] border border-[#D1D7E5] px-3 text-sm focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#0400FF]/25"
          />
          <button
            type="submit"
            disabled={status === "loading" || !draft.trim()}
            className="rounded-full bg-[#0400FF] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {status === "loading" ? "Searching…" : "Search"}
          </button>
        </form>
      </section>
      <section className={`min-h-[420px] overflow-hidden rounded-[20px] border border-[#E1E5F0] ${mobileView === "chat" ? "hidden lg:block" : ""}`}>
        {places.length ? (
          <TripMap
            pins={pins}
            connect={false}
            onSelectPin={(pin) => {
              if (pin.activityId) setSelectedId(pin.activityId);
            }}
          />
        ) : (
          <div className="flex h-full min-h-[420px] items-center justify-center bg-[#080B3A] px-6 text-center text-sm text-[#C5CAE5]">
            Search an area to see places on the map.
          </div>
        )}
      </section>
      <div className="flex gap-2 lg:hidden">
        <button type="button" className={`rounded-full px-3 py-1 text-xs ${mobileView === "chat" ? "bg-[#0400FF] text-white" : "bg-white"}`} onClick={() => setMobileView("chat")}>Chat</button>
        <button type="button" className={`rounded-full px-3 py-1 text-xs ${mobileView === "map" ? "bg-[#0400FF] text-white" : "bg-white"}`} onClick={() => setMobileView("map")}>Map</button>
      </div>
    </div>
  );
}
