"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChoiceList } from "@/components/chat/ChoiceList";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { LeavePageLink } from "@/components/ui/LeavePageLink";
import { TRAVELER_STORAGE_KEY, type TravelerProfile } from "@/lib/profile/traveler";
import {
  destinationImageUrl,
  hasCuratedCityImage,
} from "@/lib/destination-image";
import { formatCityOverlay } from "@/lib/trips/city-label";
import { tripDateInputBounds } from "@/lib/trips/dates";

type PlaceDraft = {
  city: string;
  days: number;
  arrivalDate?: string;
  departureDate?: string;
  nights?: number;
  country?: string;
  countryCode?: string;
  suggestions: { key: string; label: string }[];
};

type ChatLine = { role: "agent" | "you"; text: string };

const DREAM_OPTIONS = [
  { id: "small", label: "Small local places, not tourist traps" },
  { id: "sights", label: "The well-known sights" },
  { id: "value", label: "Fun days that do not waste money" },
  { id: "mix", label: "A mix of walking, food, and highlights" },
  { id: "other", label: "Other" },
];

export function TripAgentDesk({
  places,
  multiCity,
  onMultiCity,
  tripTitle,
  onTripTitle,
  onCityInput,
  onPickSuggestion,
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
  partyType,
  onPartyType,
  kidAges,
  onKidAges,
  kidEnergy,
  onKidEnergy,
  travelerNotes,
  onTravelerNotes,
  budget,
  onBudget,
  dreamChoice,
  onDreamChoice,
  dreamOther,
  onDreamOther,
  hotel,
  flightNumber,
  onFlightNumber,
  manualArrival,
  onManualArrival,
  flightSummary,
  confirmationPaste,
  onConfirmationPaste,
  onApplyConfirmation,
  onFillSavedFlight,
  destination,
  cities,
  interests,
  majorStops,
  onMajorStopsChange,
  idealTrip,
  onExchange,
  onBriefParsed,
  sheetReady,
  canGenerate,
  loading,
  progress,
  error,
  onGenerate,
}: {
  places: PlaceDraft[];
  multiCity: boolean;
  onMultiCity: (value: boolean) => void;
  tripTitle: string;
  onTripTitle: (value: string) => void;
  onCityInput: (index: number, value: string) => void;
  onPickSuggestion: (legIndex: number, suggestionIndex: number) => void;
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
  partyType: "solo" | "couple" | "family" | "friends" | "";
  onPartyType: (value: "solo" | "couple" | "family" | "friends") => void;
  kidAges: string;
  onKidAges: (value: string) => void;
  kidEnergy: "calm" | "balanced" | "high" | "";
  onKidEnergy: (value: "calm" | "balanced" | "high") => void;
  travelerNotes: string;
  onTravelerNotes: (value: string) => void;
  budget: string;
  onBudget: (value: string) => void;
  dreamChoice: string;
  onDreamChoice: (value: string) => void;
  dreamOther: string;
  onDreamOther: (value: string) => void;
  hotel: ReactNode;
  flightNumber: string;
  onFlightNumber: (value: string) => void;
  manualArrival: string;
  onManualArrival: (value: string) => void;
  flightSummary: string | null;
  confirmationPaste: string;
  onConfirmationPaste: (value: string) => void;
  onApplyConfirmation: () => void;
  onFillSavedFlight: () => void;
  destination: string;
  cities: string[];
  interests: string[];
  majorStops: string[];
  onMajorStopsChange: (stops: string[]) => void;
  idealTrip: string;
  onExchange: (userText: string, reply: string) => void;
  onBriefParsed?: (extracted: Record<string, unknown>) => void;
  sheetReady: boolean;
  canGenerate: boolean | null;
  loading: boolean;
  progress: string;
  error: string | null;
  onGenerate: () => void;
}) {
  const lead = places[0]?.city.trim() || "";
  const photo = lead && hasCuratedCityImage(lead);
  const dateBounds = tripDateInputBounds();
  const overlay = lead
    ? formatCityOverlay(lead, places[0]?.countryCode)
    : "";
  const cityStrip = places
    .map((p) => p.city.trim())
    .filter(Boolean)
    .join(" → ");

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-tour="tour-create-wizard">
      {/* Hero + trip header */}
      <section className="overflow-hidden rounded-[20px] border border-[#E1E5F0] bg-white shadow-[0_8px_24px_rgba(8,11,58,0.05)]">
        {!lead ? (
          <div className="bg-gradient-to-br from-[#080B3A] via-[#12185C] to-[#0400FF] px-5 py-16 text-center text-white sm:py-20">
            <p className="text-3xl font-bold tracking-tight">Plan a trip</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/75">
              Start with a city. A landmark photo and your trip sheet appear once
              you pick a place.
            </p>
            <div className="mx-auto mt-6 max-w-sm text-left">
              <CityField
                label="Where first?"
                city={places[0]?.city ?? ""}
                suggestions={places[0]?.suggestions ?? []}
                onChange={(value) => onCityInput(0, value)}
                onPick={(index) => onPickSuggestion(0, index)}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="relative h-52 sm:h-64">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={destinationImageUrl(lead)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#080B3A] to-[#1a237e] text-6xl font-bold text-white/30">
                  {lead.slice(0, 1)}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/80 via-[#080B3A]/20 to-transparent" />
              <p className="absolute bottom-4 left-5 right-5 text-left text-xl font-bold text-white sm:text-2xl">
                {overlay}
              </p>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-full bg-[#F5F7FF] p-1">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      !multiCity
                        ? "bg-[#0400FF] text-white"
                        : "text-[#0400FF]"
                    }`}
                    onClick={() => onMultiCity(false)}
                  >
                    Single city
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      multiCity
                        ? "bg-[#0400FF] text-white"
                        : "text-[#0400FF]"
                    }`}
                    onClick={() => onMultiCity(true)}
                  >
                    Multi-city
                  </button>
                </div>
                {multiCity && cityStrip ? (
                  <p className="text-sm font-semibold text-[#080B3A]">
                    {cityStrip}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CityField
                  label="City"
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
                    placeholder={`A trip to ${lead}`}
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
                    Trip start
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
                    Trip end
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
                      {nights === 1 ? "1 night" : `${nights} nights`} whole trip
                    </p>
                  ) : null}
                </div>
              </div>

              {multiCity ? (
                <div className="space-y-3 border-t border-[#F0F2F8] pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                    Stops (ordered by date)
                  </p>
                  {places.map((place, index) => (
                    <div
                      key={`stop-${index}-${place.arrivalDate ?? ""}`}
                      className="grid items-end gap-3 rounded-[12px] border border-[#F0F2F8] bg-[#FAFBFF] p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]"
                    >
                      <CityField
                        label={`Stop ${index + 1}`}
                        city={place.city}
                        suggestions={place.suggestions}
                        onChange={(value) => onCityInput(index, value)}
                        onPick={(pick) => onPickSuggestion(index, pick)}
                      />
                      <div>
                        <Label className="text-xs uppercase text-[#6B7280]">
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
                              place.departureDate &&
                              place.departureDate >= arrivalDate
                                ? place.departureDate
                                : arrivalDate;
                            onLegDates?.(index, {
                              arrivalDate,
                              departureDate,
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs uppercase text-[#6B7280]">
                          Departure
                        </Label>
                        <Input
                          type="date"
                          value={place.departureDate ?? ""}
                          min={place.arrivalDate || dateBounds.min}
                          max={dateBounds.max}
                          onChange={(e) => {
                            const departureDate = e.target.value;
                            const arrivalDate =
                              place.arrivalDate || departureDate;
                            onLegDates?.(index, {
                              arrivalDate,
                              departureDate,
                            });
                          }}
                        />
                      </div>
                      {index > 0 ? (
                        <button
                          type="button"
                          className="pb-2 text-sm font-semibold text-[#B91C1C]"
                          onClick={() => onRemoveCity(index)}
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="pb-2 text-xs text-[#9CA3AF]">First</span>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm font-semibold text-[#0400FF]"
                    onClick={onAddCity}
                  >
                    Add city
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>

      {lead ? (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-2">
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
                onBriefParsed={onBriefParsed}
              />
            </section>

            <aside
              id="trip-brief-panel"
              className="space-y-4 rounded-[20px] border border-[#E1E5F0] bg-white p-5 shadow-[0_8px_24px_rgba(8,11,58,0.05)]"
            >
              <h2 className="text-lg font-semibold text-[#080B3A]">
                Manual input
              </h2>
              <p className="text-xs text-[#6B7280]">
                The agent can fill this as you chat — or edit it yourself.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs uppercase text-[#6B7280]">
                    Trip start
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
                  <Label className="text-xs uppercase text-[#6B7280]">
                    Trip end
                  </Label>
                  <Input
                    type="date"
                    value={endDate}
                    min={startDate || dateBounds.min}
                    max={dateBounds.max}
                    onChange={(e) => onEndDate(e.target.value)}
                  />
                </div>
              </div>

              <MajorStopsField
                stops={majorStops}
                onChange={onMajorStopsChange}
              />

              <div>
                <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
                  Dream trip
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {DREAM_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onDreamChoice(opt.id)}
                      className={`rounded-[10px] px-3 py-2 text-left text-sm font-medium ${
                        dreamChoice === opt.id
                          ? "bg-[#0400FF] text-white"
                          : "bg-[#F5F7FF] text-[#080B3A]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {dreamChoice === "other" ? (
                  <Input
                    className="mt-2"
                    value={dreamOther}
                    onChange={(e) => onDreamOther(e.target.value)}
                    placeholder="Describe your dream trip"
                  />
                ) : null}
              </div>

              {hotel}

              <div>
                <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
                  Who is traveling
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(
                    [
                      ["solo", "Solo"],
                      ["couple", "Couple"],
                      ["family", "Family"],
                      ["friends", "Friends"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        partyType === id
                          ? "bg-[#080B3A] text-white"
                          : "bg-[#F5F7FF] text-[#080B3A]"
                      }`}
                      onClick={() => onPartyType(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-[#6B7280]">Travelers</span>
                  <input
                    type="number"
                    min={1}
                    aria-label="Travelers"
                    value={travelers}
                    onChange={(e) =>
                      onTravelers(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-16 rounded-[10px] border border-[#D1D7E5] px-2 py-1 text-center text-sm"
                  />
                </div>
                {partyType === "family" ? (
                  <div className="mt-3 space-y-2 rounded-[12px] border border-[#F0F2F8] bg-[#FAFBFF] p-3">
                    <div>
                      <Label className="text-xs uppercase text-[#6B7280]">
                        Kids&apos; ages
                      </Label>
                      <Input
                        value={kidAges}
                        onChange={(e) => onKidAges(e.target.value)}
                        placeholder="e.g. 8 and 12"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
                        Kids&apos; energy
                      </p>
                      <div className="mt-1 flex gap-1">
                        {(
                          [
                            ["calm", "Calm"],
                            ["balanced", "Balanced"],
                            ["high", "High"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold ${
                              kidEnergy === id
                                ? "bg-[#0400FF] text-white"
                                : "bg-white text-[#0400FF]"
                            }`}
                            onClick={() => onKidEnergy(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
                  Pace
                </p>
                <div className="mt-2 flex gap-1 rounded-full bg-[#F5F7FF] p-1">
                  {(["relaxed", "balanced", "packed"] as const).map((pace) => (
                    <button
                      key={pace}
                      type="button"
                      className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold capitalize ${
                        intensity === pace
                          ? "bg-[#0400FF] text-white"
                          : "text-[#0400FF]"
                      }`}
                      onClick={() => onIntensity(pace)}
                    >
                      {pace}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
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

              <div>
                <Label className="text-xs uppercase text-[#6B7280]">
                  Anything else the planner should know
                </Label>
                <textarea
                  value={travelerNotes}
                  onChange={(e) => onTravelerNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
                  placeholder="Accessibility, dietary, must-avoid, vibes…"
                />
              </div>

              <div className="space-y-2 rounded-[12px] border border-[#F0F2F8] p-3">
                <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
                  Inbound flight (from your confirmation)
                </p>
                <p className="text-xs text-[#6B7280]">
                  Paste the airline confirmation — we read the flight number and
                  times from the email. No live flight lookup.
                </p>
                <textarea
                  value={confirmationPaste}
                  onChange={(e) => onConfirmationPaste(e.target.value)}
                  rows={4}
                  className="w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
                  placeholder="Paste confirmation email text here…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={confirmationPaste.trim().length < 8}
                  onClick={onApplyConfirmation}
                >
                  Use confirmation times
                </Button>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="text-xs uppercase text-[#6B7280]">
                      Flight number
                    </Label>
                    <Input
                      value={flightNumber}
                      onChange={(e) => onFlightNumber(e.target.value)}
                      placeholder="e.g. NH118"
                      className="mt-1 max-w-[10rem]"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-[#6B7280]">
                      Arrival (local)
                    </Label>
                    <Input
                      type="time"
                      value={manualArrival}
                      onChange={(e) => onManualArrival(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={flightNumber.trim().length < 3}
                    onClick={onFillSavedFlight}
                  >
                    Use saved flight
                  </Button>
                </div>
                {flightSummary ? (
                  <p className="text-sm text-[#080B3A]">{flightSummary}</p>
                ) : null}
              </div>

              <div>
                <Label className="text-xs uppercase text-[#6B7280]">
                  Budget
                </Label>
                <Input
                  value={budget}
                  onChange={(e) => onBudget(e.target.value)}
                  placeholder="e.g. $2500 total, mid-range food"
                />
              </div>

              <div className="pt-2">
                <LeavePageLink href="/plan" variant="secondary">
                  View plans & billing
                </LeavePageLink>
              </div>
            </aside>
          </div>

          <div className="sticky bottom-3 z-20 space-y-2 rounded-[16px] border border-[#E1E5F0] bg-white/95 p-3 shadow-[0_8px_30px_rgba(8,11,58,0.12)] backdrop-blur">
            {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
            {progress ? <p className="text-sm text-[#0400FF]">{progress}</p> : null}
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading || !lead || !startDate || canGenerate === false}
              className={`w-full rounded-[12px] px-4 py-3.5 text-base font-semibold text-white transition ${
                sheetReady && !loading
                  ? "animate-pulse bg-[#0400FF] shadow-[0_0_24px_rgba(4,0,255,0.55)]"
                  : "bg-[#0400FF]/80"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {loading ? "Building your trip…" : "Generate itinerary"}
            </button>
            {!sheetReady ? (
              <p className="text-center text-xs text-[#6B7280]">
                Add a city, trip dates, and a bit about who&apos;s traveling —
                the button will pulse when you&apos;re ready.
              </p>
            ) : (
              <p className="text-center text-xs text-[#0400FF]">
                Sheet looks ready — tap Generate when you want the itinerary.
              </p>
            )}
          </div>
        </>
      ) : null}
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
      <Label className="text-xs uppercase tracking-wide text-[#6B7280]">
        {label}
      </Label>
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
          placeholder="e.g. Colosseum"
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
      ) : null}
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
  onBriefParsed,
}: {
  destination: string;
  cities: string[];
  startDate: string;
  travelers: number;
  interests: string[];
  idealTrip: string;
  tripTitle: string;
  onExchange: (userText: string, reply: string) => void;
  onBriefParsed?: (extracted: Record<string, unknown>) => void;
}) {
  const [log, setLog] = useState<ChatLine[]>([]);
  const [choices, setChoices] = useState<{ id: string; label: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const box = useRef<HTMLTextAreaElement>(null);
  const onExchangeRef = useRef(onExchange);
  onExchangeRef.current = onExchange;
  const onBriefParsedRef = useRef(onBriefParsed);
  onBriefParsedRef.current = onBriefParsed;
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

  async function talk(
    history: { role: "user" | "assistant"; text: string }[],
    message: string,
  ) {
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
    if (data.extracted && typeof data.extracted === "object") {
      onBriefParsedRef.current?.(data.extracted as Record<string, unknown>);
    }
    return {
      reply:
        (data.reply as string) ||
        "Tell me a little more about how you travel.",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, cityKey]);

  async function send(text?: string) {
    const said = (text ?? draft).trim();
    if (!said || status === "loading") return;
    userSpoke.current = true;
    const asked =
      [...log].reverse().find((line) => line.role === "agent")?.text ?? "";
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
      <div className="mb-3 rounded-[14px] border border-[#E8ECF6] bg-[#FAFBFF] px-3.5 py-2.5">
        <p className="text-sm font-semibold text-[#080B3A]">
          Travel agent chat
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
          Talk like you would with an agent — who you are, how you travel, what
          you care about. Paste a long brief anytime; it fills the manual sheet.
        </p>
      </div>
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
          rows={draft.length > 120 ? 5 : 2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Answer, or paste a full trip description…"
          className="min-h-11 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm text-[#080B3A] outline-none placeholder:text-[#9299B5]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && draft.trim().length < 200) {
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
