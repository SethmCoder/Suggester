"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  createOfflineTripId,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import type { ActivityRow } from "@/lib/types/trip";

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
};

type CitySuggestion = {
  id: number;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  label: string;
};

export function CreateTripWizard() {
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
    { city: "", days: 3, hotel: "" },
  ]);
  const [citySuggestions, setCitySuggestions] = useState<
    Record<number, CitySuggestion[]>
  >({});
  const [flightHint, setFlightHint] = useState<string | null>(null);

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

  function toggleInterest(i: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(i)
        ? f.interests.filter((x) => x !== i)
        : [...f.interests, i],
    }));
  }

  async function submit() {
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
        .map((l) => ({
          city: l.city.trim(),
          days: Math.max(1, Number(l.days) || 1),
          hotel: l.hotel.trim() || undefined,
          geonameId: l.geonameId,
          lat: l.lat,
          lng: l.lng,
          countryCode: l.countryCode,
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
      <div className="mb-2">
        <h1 className="text-[28px] font-bold tracking-tight text-[#080B3A]">
          Create a trip
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
                      { city: "", days: 2, hotel: "" },
                    ])
                  }
                >
                  + Add city
                </button>
              </div>
              <p className="text-xs text-[#6B7280]">
                Example: Paris 2 days → Toulouse 3 days → Paris 2 days. Each
                hotel anchors that stay’s sightseeing. Cities resolve via
                GeoNames (no API key).
              </p>
              {legs.map((leg, i) => (
                <div
                  key={i}
                  className="relative space-y-2 rounded-[12px] border border-[#E1E5F0] bg-[#F5F7FF] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#080B3A]">
                      Stay {i + 1}
                      {i > 0 ? " · transit from previous" : ""}
                    </span>
                    {legs.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs text-[#DC2626]"
                        onClick={() =>
                          setLegs((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_88px]">
                    <div className="relative">
                      <Label>City</Label>
                      <Input
                        required
                        value={leg.city}
                        onChange={(e) => {
                          const city = e.target.value;
                          setLegs((prev) =>
                            prev.map((l, j) =>
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
                        className="mt-1"
                        placeholder="Paris"
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
                          setLegs((prev) =>
                            prev.map((l, j) =>
                              j === i
                                ? {
                                    ...l,
                                    days: Math.max(1, Number(e.target.value) || 1),
                                  }
                                : l,
                            ),
                          )
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Hotel name or address</Label>
                    <Input
                      value={leg.hotel}
                      onChange={(e) =>
                        setLegs((prev) =>
                          prev.map((l, j) =>
                            j === i ? { ...l, hotel: e.target.value } : l,
                          ),
                        )
                      }
                      className="mt-1"
                      placeholder="Hotel name in this city"
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-[#6B7280]">
                Total itinerary length: <strong>{totalDays}</strong> days
                {endDate ? ` · ends ${endDate}` : ""}
              </p>
            </div>
            <div>
              <Label>Departure city (optional)</Label>
              <Input
                value={form.departureCity}
                onChange={(e) =>
                  setForm({ ...form, departureCity: e.target.value })
                }
                className="mt-1"
                placeholder="Seattle"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Start airport (IATA)</Label>
                <Input
                  value={form.originAirport}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      originAirport: e.target.value.toUpperCase(),
                    })
                  }
                  onBlur={async () => {
                    const from =
                      form.originAirport || form.departureCity;
                    const to =
                      form.destinationAirport || legs[0]?.city;
                    if (!from || !to) {
                      setFlightHint(null);
                      return;
                    }
                    try {
                      const res = await fetch(
                        `/api/flights/lookup?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
                      );
                      const data = await res.json();
                      if (!res.ok || !data.estimate) {
                        setFlightHint(
                          data.error ?? "Could not estimate this flight",
                        );
                        return;
                      }
                      const e = data.estimate;
                      setForm((f) => ({
                        ...f,
                        originAirport: e.from.iata,
                        destinationAirport: e.to.iata,
                        dayStart: e.suggestedDayStart,
                      }));
                      setFlightHint(
                        `${e.from.iata} → ${e.to.iata} · ~${Math.round(e.durationMinutes / 60)}h ${e.durationMinutes % 60}m · lands ~${e.estimatedArrivalLocal} local${e.arrivalDayOffset ? ` (+${e.arrivalDayOffset}d)` : ""} · sightseeing from ${e.suggestedDayStart}. ${e.note}`,
                      );
                    } catch {
                      setFlightHint("Flight lookup unavailable right now");
                    }
                  }}
                  className="mt-1"
                  placeholder="SEA"
                  maxLength={3}
                />
              </div>
              <div>
                <Label>Arrival airport (IATA)</Label>
                <Input
                  value={form.destinationAirport}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      destinationAirport: e.target.value.toUpperCase(),
                    })
                  }
                  className="mt-1"
                  placeholder="HND"
                  maxLength={4}
                />
              </div>
            </div>
            {flightHint ? (
              <p className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F7FF] px-3 py-2 text-xs text-[#080B3A]">
                {flightHint}
              </p>
            ) : (
              <p className="text-xs text-[#6B7280]">
                Set airports (e.g. SEA → HND) to estimate arrival from OpenFlights
                data so day 1 does not schedule impossible morning stops.
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
              <Label>Transportation</Label>
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
            </div>
            <p className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F7FF] px-3 py-2 text-xs text-[#6B7280]">
              Hotels are set per city on step 1. Sightseeing is ranked around
              each hotel pin — the planner will not invent “a cafe by your
              hotel”; it only uses real mapped places.
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
            <p>
              <span className="text-[#6B7280]">Route:</span>{" "}
              {legs
                .filter((l) => l.city.trim())
                .map((l) => `${l.city} (${l.days}d${l.hotel ? `, ${l.hotel}` : ""})`)
                .join(" → ")}
            </p>
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
              {loading ? "Working…" : "Generate itinerary"}
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
