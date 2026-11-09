"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChoiceList } from "@/components/chat/ChoiceList";
import { Button } from "@/components/ui/Button";
import { TRAVELER_STORAGE_KEY, type TravelerProfile } from "@/lib/profile/traveler";
import { Input, Label } from "@/components/ui/Input";
import {
  destinationImageUrl,
  hasCuratedCityImage,
} from "@/lib/destination-image";
import { tripDateInputBounds } from "@/lib/trips/dates";

type PlaceDraft = {
  city: string;
  days: number;
  arrivalDate?: string;
  departureDate?: string;
  nights?: number;
  country?: string;
  suggestions: { key: string; label: string }[];
};

type ChatLine = { role: "agent" | "you"; text: string };

export function TripAgentDesk({
  places,
  tripTitle,
  onTripTitle,
  onCityInput,
  onPickSuggestion,
  onLegDays,
  onLegDates,
  onAddCity,
  onRemoveCity,
  startDate,
  endDate,
  nights,
  onStartDate,
  onEndDate,
  travelers,
  onTravelers,
  intensity,
  onIntensity,
  transport,
  onTransport,
  party,
  travelerMode,
  onTravelerMode,
  planningClarity,
  onPlanningClarity,
  hotel,
  flights,
  destination,
  cities,
  interests,
  majorStops,
  onMajorStopsChange,
  idealTrip,
  onExchange,
  canGenerate,
  loading,
  progress,
  error,
  onGenerate,
}: {
  places: PlaceDraft[];
  tripTitle: string;
  onTripTitle: (value: string) => void;
  onCityInput: (index: number, value: string) => void;
  onPickSuggestion: (legIndex: number, suggestionIndex: number) => void;
  onLegDays: (index: number, days: number) => void;
  onLegDates?: (
    index: number,
    dates: { arrivalDate: string; departureDate: string },
  ) => void;
  onAddCity: () => void;
  onRemoveCity: (index: number) => void;
  startDate: string;
  endDate: string;
  nights: number;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
  travelers: number;
  onTravelers: (count: number) => void;
  intensity: "relaxed" | "balanced" | "packed";
  onIntensity: (value: "relaxed" | "balanced" | "packed") => void;
  transport: string;
  onTransport: (value: string) => void;
  party: string;
  travelerMode: "business" | "leisure" | "";
  onTravelerMode: (value: "business" | "leisure") => void;
  planningClarity:
    | "know_where_and_what"
    | "know_where_not_what"
    | "know_neither"
    | "";
  onPlanningClarity: (
    value: "know_where_and_what" | "know_where_not_what" | "know_neither",
  ) => void;
  hotel: ReactNode;
  flights: ReactNode;
  destination: string;
  cities: string[];
  interests: string[];
  majorStops: string[];
  onMajorStopsChange: (stops: string[]) => void;
  idealTrip: string;
  onExchange: (userText: string, reply: string) => void;
  canGenerate: boolean | null;
  loading: boolean;
  progress: string;
  error: string | null;
  onGenerate: () => void;
}) {
  const lead = places[0]?.city.trim() || "";
  const photo = lead && hasCuratedCityImage(lead);
  const dateBounds = tripDateInputBounds();

  return (
    <div className="mx-auto max-w-6xl" data-tour="tour-create-wizard">
      <section className="mb-6 overflow-hidden rounded-[20px] border border-[#E1E5F0] bg-white shadow-[0_8px_24px_rgba(8,11,58,0.05)]">
        {photo ? (
          <div className="relative h-44 sm:h-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={destinationImageUrl(lead)}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/70 to-transparent" />
            <p className="absolute bottom-4 left-5 text-2xl font-bold text-white">
              {lead}
            </p>
          </div>
        ) : (
          <div className="bg-[#080B3A] px-5 py-8 text-white">
            <p className="text-2xl font-bold">{lead || "Where are you going?"}</p>
          </div>
        )}
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <CityField
            label="Place"
            city={places[0]?.city ?? ""}
            suggestions={places[0]?.suggestions ?? []}
            onChange={(value) => onCityInput(0, value)}
            onPick={(index) => onPickSuggestion(0, index)}
          />
          <div>
            <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
              Title
            </Label>
            <Input
              value={tripTitle}
              onChange={(e) => onTripTitle(e.target.value)}
              placeholder={lead ? `A trip to ${lead}` : "Title of the trip"}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
              Arrival
            </Label>
            <Input
              type="date"
              value={startDate}
              min={dateBounds.min}
              max={dateBounds.max}
              onChange={(e) => onStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
              Departure
            </Label>
            <Input
              type="date"
              value={endDate}
              min={startDate || dateBounds.min}
              max={dateBounds.max}
              onChange={(e) => onEndDate(e.target.value)}
            />
            {startDate && endDate ? (
              <p className="mt-1 text-xs text-[#6B7280]">
                {nights === 1 ? "1 night" : `${nights} nights`} on this trip
              </p>
            ) : (
              <p className="mt-1 text-xs text-[#6B7280]">
                Pick arrival and departure (year {dateBounds.min.slice(0, 4)}–
                {dateBounds.max.slice(0, 4)}).
              </p>
            )}
          </div>
        </div>
        <div className="space-y-3 border-t border-[#F0F2F8] px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Who is this trip for?
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "leisure", label: "Leisure" },
                { id: "business", label: "Business traveler" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onTravelerMode(opt.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  travelerMode === opt.id
                    ? "bg-[#0400FF] text-white"
                    : "bg-[#F5F7FF] text-[#080B3A]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            When you plan a trip, do you…
          </p>
          <div className="flex flex-col gap-2">
            {(
              [
                {
                  id: "know_where_and_what",
                  label: "Know where you want to go and what you want to do",
                },
                {
                  id: "know_where_not_what",
                  label: "Know where you want to go but not what to do",
                },
                {
                  id: "know_neither",
                  label: "Don't know where or what yet",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPlanningClarity(opt.id)}
                className={`rounded-[10px] px-3 py-2 text-left text-sm font-medium ${
                  planningClarity === opt.id
                    ? "bg-[#0400FF] text-white"
                    : "bg-[#F5F7FF] text-[#080B3A]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {places.slice(1).map((place, offset) => {
          const index = offset + 1;
          const placeNights =
            place.nights ?? Math.max(0, (place.days || 1) - 1);
          return (
            <div
              key={index}
              className="grid items-end gap-3 border-t border-[#F0F2F8] px-4 py-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:px-5"
            >
              <CityField
                label={`City ${index + 1}`}
                city={place.city}
                suggestions={place.suggestions}
                onChange={(value) => onCityInput(index, value)}
                onPick={(pick) => onPickSuggestion(index, pick)}
              />
              <div>
                <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
                  Arrival
                </Label>
                <Input
                  type="date"
                  value={place.arrivalDate ?? ""}
                  min={dateBounds.min}
                  max={dateBounds.max}
                  onChange={(e) => {
                    const arrivalDate = e.target.value;
                    const departureDate =
                      place.departureDate && place.departureDate >= arrivalDate
                        ? place.departureDate
                        : arrivalDate;
                    onLegDates?.(index, { arrivalDate, departureDate });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
                  Departure
                </Label>
                <Input
                  type="date"
                  value={place.departureDate ?? ""}
                  min={place.arrivalDate || dateBounds.min}
                  max={dateBounds.max}
                  onChange={(e) => {
                    const departureDate = e.target.value;
                    const arrivalDate = place.arrivalDate || departureDate;
                    onLegDates?.(index, { arrivalDate, departureDate });
                  }}
                />
                <p className="mt-1 text-xs text-[#6B7280]">
                  {placeNights === 1 ? "1 night" : `${placeNights} nights`}
                </p>
              </div>
              <button
                type="button"
                className="pb-2 text-sm font-semibold text-[#B91C1C]"
                onClick={() => onRemoveCity(index)}
              >
                Remove
              </button>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0F2F8] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-end gap-3 text-sm text-[#6B7280]">
            <div>
              <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
                Arrival in {places[0]?.city.trim() || "first city"}
              </Label>
              <Input
                type="date"
                value={places[0]?.arrivalDate ?? startDate}
                min={dateBounds.min}
                max={dateBounds.max}
                onChange={(e) => {
                  const arrivalDate = e.target.value;
                  const departureDate =
                    places[0]?.departureDate &&
                    places[0].departureDate >= arrivalDate
                      ? places[0].departureDate
                      : endDate || arrivalDate;
                  onLegDates?.(0, { arrivalDate, departureDate });
                }}
                className="w-44"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
                Departure
              </Label>
              <Input
                type="date"
                value={places[0]?.departureDate ?? endDate}
                min={places[0]?.arrivalDate || startDate || dateBounds.min}
                max={dateBounds.max}
                onChange={(e) => {
                  const departureDate = e.target.value;
                  const arrivalDate =
                    places[0]?.arrivalDate || startDate || departureDate;
                  onLegDates?.(0, { arrivalDate, departureDate });
                }}
                className="w-44"
              />
            </div>
            <p className="pb-2">
              {(places[0]?.nights ?? Math.max(0, (places[0]?.days ?? 1) - 1)) === 1
                ? "1 night"
                : `${places[0]?.nights ?? Math.max(0, (places[0]?.days ?? 1) - 1)} nights`}
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-[#0400FF]"
            onClick={onAddCity}
          >
            Add a city
          </button>
        </div>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_340px]">
        <section className="rounded-[20px] border border-[#E1E5F0] bg-white p-4 shadow-[0_8px_24px_rgba(8,11,58,0.05)] sm:p-6">
          <AgentThread
            destination={destination}
            cities={cities}
            startDate={startDate}
            travelers={travelers}
            interests={interests}
            idealTrip={idealTrip}
            tripTitle={tripTitle}
            onExchange={onExchange}
          />
        </section>
        <aside className="flex max-h-[calc(100vh-7rem)] flex-col rounded-[20px] border border-[#E1E5F0] bg-white p-5 shadow-[0_8px_24px_rgba(8,11,58,0.05)] lg:sticky lg:top-6">
          <div className="min-h-0 flex-1 space-y-5 overflow-auto pr-1">
            <h2 className="text-[18px] font-semibold text-[#080B3A]">Trip brief</h2>
            <p className="mt-1 text-xs text-[#6B7280]">Fills in as you talk.</p>
            <dl className="space-y-2.5 text-sm">
              <BriefRow label="Title" value={tripTitle} />
              <BriefRow label="Cities" value={cities.filter(Boolean).join(" → ")} />
              <BriefRow
                label="Dates"
                value={
                  startDate
                    ? `${startDate}${endDate ? ` – ${endDate}` : ""}${
                        nights
                          ? ` · ${nights === 1 ? "1 night" : `${nights} nights`}`
                          : ""
                      }`
                    : ""
                }
              />
              <BriefRow
                label="Who"
                value={
                  travelerMode
                    ? travelerMode === "business"
                      ? "Business traveler"
                      : "Leisure"
                    : party
                }
              />
              <BriefRow
                label="Planning"
                value={
                  planningClarity === "know_where_and_what"
                    ? "Know where and what"
                    : planningClarity === "know_where_not_what"
                      ? "Know where, not what"
                      : planningClarity === "know_neither"
                        ? "Exploring where and what"
                        : ""
                }
              />
            </dl>
            {interests.length ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  Interests
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {interests.slice(0, 8).map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full bg-[#F5F7FF] px-2.5 py-1 text-xs font-medium text-[#080B3A]"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <MajorStopsField stops={majorStops} onChange={onMajorStopsChange} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                Pace
              </p>
              <div className="mt-2 flex gap-1 rounded-full bg-[#F5F7FF] p-1">
                {(["relaxed", "balanced", "packed"] as const).map((pace) => (
                  <button
                    key={pace}
                    type="button"
                    className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold capitalize ${
                      intensity === pace ? "bg-[#0400FF] text-white" : "text-[#0400FF]"
                    }`}
                    onClick={() => onIntensity(pace)}
                  >
                    {pace}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[#6B7280]">Travelers</span>
              <input
                type="number"
                min={1}
                aria-label="Travelers"
                value={travelers}
                onChange={(e) => onTravelers(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded-[10px] border border-[#D1D7E5] px-2 py-1 text-center text-sm text-[#080B3A]"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                Getting around
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(
                  [
                    ["walking", "Walking"],
                    ["transit", "Transit"],
                    ["driving", "Driving"],
                    ["cycling", "Cycling"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      transport === value
                        ? "bg-[#080B3A] text-white"
                        : "bg-[#F5F7FF] text-[#080B3A]"
                    }`}
                    onClick={() => onTransport(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {hotel}
            {flights}
          </div>
          <div className="shrink-0 space-y-2 border-t border-[#F0F2F8] bg-white pt-4">
            <p className="text-xs leading-relaxed text-[#6B7280]">
              {!lead || !startDate
                ? "Add a city and start date to generate."
                : canGenerate === null
                  ? "Checking whether generation is included."
                  : canGenerate
                    ? majorStops.length
                      ? "Major stops stay locked in. Waypoint fills the rest of each day from your interests."
                      : "Generation is included on this account."
                    : "Free includes 3 generated trips. Upgrade on Plans for more, or your AI allowance may be used up."}
            </p>
            {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
            {progress ? <p className="text-sm text-[#0400FF]">{progress}</p> : null}
            <Button
              type="button"
              className="w-full"
              onClick={onGenerate}
              disabled={loading || !lead || !startDate}
            >
              {loading ? "Working…" : "Generate itinerary"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CityField({
  label,
  city,
  suggestions,
  onChange,
  onPick,
}: {
  label: string;
  city: string;
  suggestions: { key: string; label: string }[];
  onChange: (value: string) => void;
  onPick: (index: number) => void;
}) {
  return (
    <div className="relative">
      <Label className="text-xs uppercase tracking-wide text-[#6B7280]">{label}</Label>
      <Input
        value={city}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tokyo"
        autoComplete="off"
      />
      {suggestions.length ? (
        <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-[12px] border border-[#E1E5F0] bg-white shadow-lg">
          {suggestions.map((item, index) => (
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
      ) : null}
    </div>
  );
}

function readTraveler(): TravelerProfile | null {
  try {
    const raw = localStorage.getItem(TRAVELER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TravelerProfile;
  } catch {
    return null;
  }
}

function BriefRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[#6B7280]">{label}</dt>
      <dd className="line-clamp-2 text-right font-medium text-[#080B3A]">{value}</dd>
    </div>
  );
}

function MajorStopsField({
  stops,
  onChange,
}: {
  stops: string[];
  onChange: (stops: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addStop(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (stops.some((stop) => stop.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...stops, value].slice(0, 16));
    setDraft("");
  }

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
        Major stops
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
        Add places you already know. Waypoint will schedule them and fill the rest of each day
        from your interests.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addStop(draft);
            }
          }}
          placeholder="e.g. Colosseum, Vatican Museums"
          aria-label="Add a major stop"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => addStop(draft)}
          disabled={!draft.trim()}
        >
          Add
        </Button>
      </div>
      {stops.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {stops.map((stop) => (
            <li key={stop}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-[#D7DEFF] bg-[#F5F7FF] px-2.5 py-1 text-xs font-medium text-[#0400FF]"
                onClick={() => onChange(stops.filter((item) => item !== stop))}
                aria-label={`Remove ${stop}`}
              >
                {stop}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[#9299B5]">Optional — leave empty to plan from interests only.</p>
      )}
    </div>
  );
}

function AgentThread({
  destination,
  cities,
  startDate,
  travelers,
  interests,
  idealTrip,
  tripTitle,
  onExchange,
}: {
  destination: string;
  cities: string[];
  startDate: string;
  travelers: number;
  interests: string[];
  idealTrip: string;
  tripTitle: string;
  onExchange: (userText: string, reply: string) => void;
}) {
  const [log, setLog] = useState<ChatLine[]>([]);
  const [choices, setChoices] = useState<{ id: string; label: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const box = useRef<HTMLTextAreaElement>(null);
  const onExchangeRef = useRef(onExchange);
  onExchangeRef.current = onExchange;
  const userSpoke = useRef(false);
  const payload = useRef({
    destination,
    cities,
    startDate,
    travelers,
    interests,
    idealTrip,
    tripTitle,
  });
  payload.current = {
    destination,
    cities,
    startDate,
    travelers,
    interests,
    idealTrip,
    tripTitle,
  };

  const cityKey = cities.map((city) => city.trim()).filter(Boolean).join("|");

  async function talk(history: { role: "user" | "assistant"; text: string }[], message: string) {
    const res = await fetch("/api/trips/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload.current,
        ...(readTraveler() ? { traveler: readTraveler() } : {}),
        history,
        message,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not continue");
    return {
      reply: (data.reply as string) || "Tell me a little more about how you want the days to feel.",
      choices: (data.choices as { id: string; label: string }[]) ?? [],
    };
  }

  useEffect(() => {
    if (userSpoke.current) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setStatus("loading");
      void talk([], "")
        .then((turn) => {
          if (cancelled || userSpoke.current) return;
          setLog([{ role: "agent", text: turn.reply }]);
          setChoices(turn.choices);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, destination.trim() || cityKey ? 400 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // Re-greet only before the traveler has spoken, so naming a city updates the opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, cityKey]);

  async function send(text?: string) {
    const said = (text ?? draft).trim();
    if (!said || status === "loading") return;
    userSpoke.current = true;
    const asked = [...log].reverse().find((line) => line.role === "agent")?.text ?? "";
    const history = log.map((line) => ({
      role: line.role === "you" ? ("user" as const) : ("assistant" as const),
      text: line.text,
    }));
    setLog((prev) => [...prev, { role: "you", text: said }]);
    setDraft("");
    setChoices([]);
    setStatus("loading");
    try {
      const turn = await talk(history, said);
      onExchangeRef.current(said, asked);
      setLog((prev) => [...prev, { role: "agent", text: turn.reply }]);
      setChoices(turn.choices);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-[420px] flex-col">
      <div className="flex-1 space-y-3">
        {log.map((line, index) => (
          <p
            key={`${line.role}-${index}`}
            className={`max-w-[85%] rounded-[18px] px-4 py-3 text-sm leading-relaxed ${
              line.role === "agent"
                ? "bg-[#F5F7FF] text-[#1F2937]"
                : "ml-auto bg-[#080B3A] text-white"
            }`}
          >
            {line.text}
          </p>
        ))}
        {status === "ready" ? (
          <ChoiceList
            choices={choices}
            onPick={(label) => void send(label)}
            onOther={() => box.current?.focus()}
          />
        ) : null}
        {status === "loading" ? (
          <p className="text-sm text-[#0400FF]">Thinking about the trip…</p>
        ) : null}
        {status === "error" ? (
          <p className="text-sm text-[#DC2626]">
            That reply did not come through. You can try again.
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex items-end gap-2 rounded-[16px] border border-[#D1D7E5] bg-[#F5F7FF] p-2">
        <textarea
          ref={box}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={choices.length ? "Other — type your own answer" : "Ask about the days, or describe the trip you want"}
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[#080B3A] outline-none placeholder:text-[#9299B5]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void send()}
          disabled={!draft.trim() || status === "loading"}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
