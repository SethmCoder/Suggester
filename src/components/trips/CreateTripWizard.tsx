"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

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

export function CreateTripWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const [form, setForm] = useState({
    destination: "",
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
    hotel: "",
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
  const [flightHint, setFlightHint] = useState<string | null>(null);

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
    try {
      const res = await fetch("/api/trips/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: form.destination,
          departureCity: form.departureCity,
          originAirport: form.originAirport || undefined,
          destinationAirport: form.destinationAirport || undefined,
          startDate: form.startDate,
          endDate: form.endDate,
          travelers: form.travelers,
          budget: form.budget ? Number(form.budget) : undefined,
          currency: form.currency,
          interests: [
            ...form.interests,
            ...(form.customInterest ? [form.customInterest] : []),
          ],
          intensity: form.intensity,
          transport: form.transport,
          hotel: form.hotel,
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
        }),
      });
      setProgress("Generating itinerary…");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/trips/${data.tripId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
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
            <div>
              <Label>Destination</Label>
              <Input
                required
                value={form.destination}
                onChange={(e) =>
                  setForm({ ...form, destination: e.target.value })
                }
                className="mt-1"
                placeholder="Paris, France"
              />
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
                      form.destinationAirport || form.destination;
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
                <Label>End date</Label>
                <Input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                  className="mt-1"
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
            <div>
              <Label>Hotel area (optional)</Label>
              <Input
                value={form.hotel}
                onChange={(e) => setForm({ ...form, hotel: e.target.value })}
                className="mt-1"
              />
            </div>
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
              <span className="text-[#6B7280]">Destination:</span>{" "}
              {form.destination}
            </p>
            <p>
              <span className="text-[#6B7280]">Dates:</span> {form.startDate} –{" "}
              {form.endDate}
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
              disabled={step === 0 && !form.destination}
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
