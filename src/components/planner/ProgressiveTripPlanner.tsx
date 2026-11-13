"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DestinationCard } from "@/components/discover/DestinationCard";
import { ArchitectClarify } from "@/components/planner/ArchitectClarify";
import {
  PlanningStages,
  type PlannerStage,
} from "@/components/planner/PlanningStages";
import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import type {
  DestinationRecommendation,
  DiscoverRegion,
} from "@/lib/discover/types";
import { destinationImageUrl } from "@/lib/destination-image";
import { saveFutureTrip } from "@/lib/future-trips/sync";
import { loadIntelligence } from "@/lib/intelligence/sync";
import {
  addCalendarDays,
  defaultTripStart,
  sanitizeTripDate,
} from "@/lib/trips/dates";
import { buildArchitectWizardHref } from "@/lib/trips/architect-handoff";
import type { NightAllocationResult } from "@/lib/trips/night-allocation";

const PACE_OPTIONS = [
  { id: "relaxed" as const, label: "Relaxed" },
  { id: "balanced" as const, label: "Balanced" },
  { id: "packed" as const, label: "Packed" },
];

const INTEREST_OPTIONS = [
  "food",
  "culture",
  "architecture",
  "museums",
  "nightlife",
  "nature",
  "shopping",
  "history",
];

const STAGE_ORDER: PlannerStage[] = [
  "dream",
  "destinations",
  "decide",
  "places",
  "book",
  "organize",
];

const DRAFT_PREFIX = "waypoint-architect-draft:";

type PlacePick = {
  city: string;
  name: string;
  selected: boolean;
};

function ideaKey(idea: string): string {
  let h = 0;
  const s = idea.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${DRAFT_PREFIX}${h}`;
}

function detectRegion(idea: string): DiscoverRegion | undefined {
  const t = idea.toLowerCase();
  if (/\basia\b|japan|korea|thailand|vietnam|bali|singapore|taiwan/.test(t))
    return "asia";
  if (/\beurope\b|italy|france|spain|portugal|uk|britain|greece/.test(t))
    return "europe";
  if (/\bnorth america\b|usa|canada|mexico\b/.test(t)) return "north-america";
  if (/\blatin america\b|brazil|argentina|peru|colombia/.test(t))
    return "latin-america";
  if (/\bmiddle east\b|dubai|uae|turkey|istanbul/.test(t)) return "middle-east";
  if (/\bafrica\b|morocco|egypt|kenya|south africa/.test(t)) return "africa";
  if (/\boceania\b|australia|new zealand|fiji/.test(t)) return "oceania";
  return undefined;
}

function catalogTransitNote(city: string): string | null {
  const record = DESTINATION_CATALOG.find(
    (d) => d.name.toLowerCase() === city.toLowerCase(),
  );
  return record?.transitNote ?? null;
}

function needsClarify(idea: string, budget: number | null): boolean {
  const hasDates =
    /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2})\b/i.test(
      idea,
    );
  const hasBudget = budget != null || /\$|budget|usd|euro/i.test(idea);
  return !hasDates || !hasBudget;
}

export function ProgressiveTripPlanner() {
  const router = useRouter();
  const [stage, setStage] = useState<PlannerStage>("dream");
  const [idea, setIdea] = useState("");
  const [pace, setPace] = useState<"relaxed" | "balanced" | "packed">(
    "balanced",
  );
  const [travelers, setTravelers] = useState(2);
  const [interests, setInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<NightAllocationResult | null>(
    null,
  );
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [lockNote, setLockNote] = useState<string | null>(null);
  const [picks, setPicks] = useState<PlacePick[]>([]);
  const [bookingPaste, setBookingPaste] = useState("");
  const [startDate, setStartDate] = useState(defaultTripStart(45));
  const [showClarify, setShowClarify] = useState(false);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [destinations, setDestinations] = useState<DestinationRecommendation[]>(
    [],
  );
  const [selectedDestIds, setSelectedDestIds] = useState<string[]>([]);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const totalNights = allocation?.totalNights ?? 0;
  const endDate = useMemo(() => {
    const start = sanitizeTripDate(startDate) || defaultTripStart(45);
    return addCalendarDays(start, Math.max(1, totalNights));
  }, [startDate, totalNights]);

  useEffect(() => {
    if (profileHydrated) return;
    void loadIntelligence()
      .then(({ profile }) => {
        const fromProfile = profile.explicit.interests ?? [];
        if (fromProfile.length) {
          setInterests((prev) =>
            prev.length ? prev : [...new Set(fromProfile)].slice(0, 8),
          );
        }
        if (
          profile.explicit.pace === "relaxed" ||
          profile.explicit.pace === "balanced" ||
          profile.explicit.pace === "packed"
        ) {
          setPace(profile.explicit.pace);
        }
        if (profile.explicit.budgetMax != null) {
          setBudget(profile.explicit.budgetMax);
        }
        setProfileHydrated(true);
      })
      .catch(() => setProfileHydrated(true));
  }, [profileHydrated]);

  useEffect(() => {
    if (draftRestored || !idea.trim()) return;
    try {
      const raw = sessionStorage.getItem(ideaKey(idea));
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        stage?: PlannerStage;
        allocation?: NightAllocationResult;
        locked?: Record<string, boolean>;
        picks?: PlacePick[];
        selectedDestIds?: string[];
        startDate?: string;
        interests?: string[];
        pace?: "relaxed" | "balanced" | "packed";
        travelers?: number;
        bookingPaste?: string;
      };
      if (draft.allocation?.cities?.length) setAllocation(draft.allocation);
      if (draft.locked) setLocked(draft.locked);
      if (draft.picks?.length) setPicks(draft.picks);
      if (draft.selectedDestIds?.length)
        setSelectedDestIds(draft.selectedDestIds);
      if (draft.startDate) setStartDate(draft.startDate);
      if (draft.interests?.length) setInterests(draft.interests);
      if (draft.pace) setPace(draft.pace);
      if (draft.travelers) setTravelers(draft.travelers);
      if (draft.bookingPaste) setBookingPaste(draft.bookingPaste);
      if (draft.stage && STAGE_ORDER.includes(draft.stage)) {
        setStage(draft.stage);
      }
      setDraftRestored(true);
    } catch {
      /* ignore corrupt draft */
    }
  }, [idea, draftRestored]);

  useEffect(() => {
    if (stage !== "destinations" || destinations.length || busy || !idea.trim())
      return;
    void loadDestinationCards(idea, detectRegion(idea));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when entering empty destinations
  }, [stage]);

  useEffect(() => {
    if (!allocation?.cities.length || !idea.trim()) return;
    try {
      sessionStorage.setItem(
        ideaKey(idea),
        JSON.stringify({
          stage,
          allocation,
          locked,
          picks,
          selectedDestIds,
          startDate,
          interests,
          pace,
          travelers,
          bookingPaste,
        }),
      );
    } catch {
      /* quota */
    }
  }, [
    idea,
    stage,
    allocation,
    locked,
    picks,
    selectedDestIds,
    startDate,
    interests,
    pace,
    travelers,
    bookingPaste,
  ]);

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value],
    );
  }

  function seedPlacePicks(alloc: NightAllocationResult) {
    const next: PlacePick[] = [];
    for (const city of alloc.cities) {
      const record = DESTINATION_CATALOG.find(
        (d) => d.name.toLowerCase() === city.city.toLowerCase(),
      );
      for (const name of (record?.attractions ?? city.attractionsSample).slice(
        0,
        4,
      )) {
        next.push({ city: city.city, name, selected: true });
      }
    }
    setPicks(next);
  }

  async function loadDestinationCards(query: string, region?: DiscoverRegion) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.slice(0, 500),
          interests,
          region,
          durationDays: allocation?.totalNights
            ? allocation.totalNights + 1
            : undefined,
          budgetMax: budget ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        sections?: { destinations: DestinationRecommendation[] }[];
        error?: string;
      };
      const list =
        data.sections?.flatMap((s) => s.destinations).filter(Boolean) ?? [];
      const unique = new Map<string, DestinationRecommendation>();
      for (const d of list) unique.set(d.id, d);
      const dests = [...unique.values()].slice(0, 8);
      setDestinations(dests);
      if (!selectedDestIds.length && dests.length) {
        // Preselect top matches that appear in current allocation cities
        const cityNames = new Set(
          (allocation?.cities ?? []).map((c) => c.city.toLowerCase()),
        );
        const pre = dests
          .filter((d) => cityNames.has(d.name.toLowerCase()))
          .map((d) => d.id);
        setSelectedDestIds(pre.length ? pre : dests.slice(0, 2).map((d) => d.id));
      }
    } catch {
      setError("Could not load destination ideas.");
    } finally {
      setBusy(false);
    }
  }

  async function runDream() {
    setBusy(true);
    setError(null);
    setDraftRestored(true);
    try {
      const res = await fetch("/api/trips/parse-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, pace }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        interests?: string[];
        allocation?: NightAllocationResult | null;
        cities?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not read that idea.");
        return;
      }
      if (data.interests?.length) {
        setInterests((prev) => [...new Set([...prev, ...data.interests!])]);
      }

      if (data.allocation?.cities?.length) {
        setAllocation(data.allocation);
        setLocked({});
        seedPlacePicks(data.allocation);
        setSelectedDestIds([]);
      } else {
        setAllocation(null);
        setSelectedDestIds([]);
      }

      if (needsClarify(idea, budget)) {
        setShowClarify(true);
        setStage("dream");
      } else {
        setShowClarify(false);
        setStage("destinations");
        await loadDestinationCards(idea, detectRegion(idea));
      }
    } finally {
      setBusy(false);
    }
  }

  async function afterClarify(patch: {
    interests?: string[];
    travelers?: number;
    intensity?: string;
    budget?: number | null;
  }) {
    if (patch.interests?.length) {
      setInterests((prev) => [...new Set([...prev, ...patch.interests!])]);
    }
    if (patch.travelers) setTravelers(patch.travelers);
    if (
      patch.intensity === "relaxed" ||
      patch.intensity === "balanced" ||
      patch.intensity === "packed"
    ) {
      setPace(patch.intensity);
    }
    if (patch.budget !== undefined) setBudget(patch.budget);
    setShowClarify(false);
    setStage("destinations");
    await loadDestinationCards(idea, detectRegion(idea));
  }

  async function confirmDestinations() {
    const chosen = destinations.filter((d) => selectedDestIds.includes(d.id));
    const cityNames =
      chosen.length > 0
        ? chosen.map((d) => d.name)
        : (allocation?.cities.map((c) => c.city) ?? []);
    if (!cityNames.length) {
      setError("Select at least one destination to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const total =
        allocation?.totalNights ??
        Math.max(3, cityNames.length * 3);
      const res = await fetch("/api/trips/allocate-nights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cities: cityNames,
          totalNights: total,
          interests,
          pace,
          enrich: true,
        }),
      });
      const data = (await res.json()) as NightAllocationResult & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not allocate nights.");
        return;
      }
      setAllocation(data);
      setLocked({});
      seedPlacePicks(data);
      setStage("decide");
    } finally {
      setBusy(false);
    }
  }

  async function recalculate(nextCities: NightAllocationResult["cities"]) {
    if (!allocation) return;
    setBusy(true);
    setError(null);
    try {
      const lockedCities = nextCities.filter((c) => locked[c.city]);
      const res = await fetch("/api/trips/allocate-nights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cities: nextCities.map((c) => c.city),
          totalNights: allocation.totalNights,
          interests,
          pace,
          locked: nextCities.map((c) => ({
            city: c.city,
            nights: c.nights,
            locked: Boolean(locked[c.city]),
          })),
          enrich: true,
        }),
      });
      const data = (await res.json()) as NightAllocationResult & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not recalculate nights.");
        return;
      }
      if (lockedCities.length) {
        const parts = lockedCities.map(
          (c) => `${c.city} locked at ${c.nights}`,
        );
        setLockNote(
          `${parts.join(", ")} → remaining nights redistributed across unlocked cities.`,
        );
      } else {
        setLockNote(null);
      }
      setAllocation(data);
      seedPlacePicks(data);
    } finally {
      setBusy(false);
    }
  }

  function updateCityNights(city: string, nights: number) {
    if (!allocation) return;
    const next = allocation.cities.map((c) =>
      c.city === city
        ? { ...c, nights: Math.max(0, Math.floor(nights) || 0) }
        : c,
    );
    setAllocation({ ...allocation, cities: next });
    setLocked((prev) => ({ ...prev, [city]: true }));
    setLockNote(
      `${city} locked at ${Math.max(0, Math.floor(nights) || 0)} → remaining nights will redistribute when you recalculate.`,
    );
  }

  function buildWizardHref() {
    if (!allocation?.cities.length) return "/trips/new?wizard=1";
    void import("@/lib/intelligence/sync")
      .then(({ postIntelligenceSignal }) =>
        postIntelligenceSignal({
          type: "explicit_set",
          patch: { pace, interests },
        }),
      )
      .catch(() => undefined);
    return buildArchitectWizardHref({
      allocation,
      startDate: sanitizeTripDate(startDate) || defaultTripStart(45),
      endDate,
      travelers,
      pace,
      interests,
      mustSee: picks.filter((p) => p.selected).map((p) => p.name),
      idea,
      confirmationPaste: bookingPaste,
      budget,
    });
  }

  async function saveForLater() {
    if (!allocation?.cities.length) {
      setError("Add destinations before saving for later.");
      return;
    }
    setBusy(true);
    setSaveNote(null);
    try {
      const trip = await saveFutureTrip({
        destination: allocation.cities.map((c) => c.city).join(" → "),
        title: idea.slice(0, 80) || "Trip Architect draft",
        status: "wishlist",
        estimatedDurationDays: totalNights + 1,
        travelers,
        budget: budget ?? undefined,
        interests,
        notes: idea,
        preferences: {
          architect: true,
          pace,
          startDate,
          allocation,
          mustSee: picks.filter((p) => p.selected).map((p) => p.name),
          selectedDestIds,
        },
      });
      setSaveNote("Saved to Future Trips");
      void import("@/lib/intelligence/sync")
        .then(({ postIntelligenceSignal }) =>
          postIntelligenceSignal({
            type: "future_trip_create",
            destination: trip.destination,
            interests,
          }),
        )
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="rounded-[16px] border border-[#E1E5F0] bg-white px-5 py-6 shadow-[0_4px_16px_rgba(8,11,58,0.04)] sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0400FF]">
          Waypoint Trip Architect
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[#080B3A]">
          From idea to itinerary
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Dream a trip, pick destinations, decide nights, choose places, then
          organize a day-by-day plan you can edit.
        </p>
        <div className="mt-5">
          <PlanningStages
            current={stage}
            onSelect={(s) => {
              if (STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(stage))
                setStage(s);
            }}
          />
        </div>
      </header>

      {stage === "dream" ? (
        <section className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#080B3A]">
            What&apos;s the idea?
          </h2>
          <textarea
            value={idea}
            onChange={(e) => {
              setIdea(e.target.value);
              setDraftRestored(false);
            }}
            rows={3}
            placeholder='e.g. "I want to visit Japan for 10 days" or "somewhere in Asia, food and temples"'
            className="w-full rounded-[12px] border border-[#D1D7E5] px-3.5 py-3 text-sm text-[#080B3A] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Pace
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PACE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPace(opt.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    pace === opt.id
                      ? "bg-[#0400FF] text-white"
                      : "bg-[#F5F7FF] text-[#080B3A]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Interests
              {profileHydrated && interests.length
                ? " (from your travel profile)"
                : " (optional)"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleInterest(opt)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                    interests.includes(opt)
                      ? "bg-[#0400FF] text-white"
                      : "bg-[#F5F7FF] text-[#080B3A]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-[#6B7280]">
              Travelers
              <input
                type="number"
                min={1}
                max={12}
                value={travelers}
                onChange={(e) => setTravelers(Number(e.target.value) || 1)}
                className="ml-2 w-16 rounded-[8px] border border-[#D1D7E5] px-2 py-1 text-[#080B3A]"
              />
            </label>
          </div>
          {!showClarify ? (
            <Button
              type="button"
              disabled={busy || idea.trim().length < 3}
              onClick={() => void runDream()}
            >
              {busy ? "Working…" : "Continue"}
            </Button>
          ) : (
            <ArchitectClarify
              idea={idea}
              cities={allocation?.cities.map((c) => c.city) ?? []}
              interests={interests}
              travelers={travelers}
              intensity={pace}
              onDone={(patch) => void afterClarify(patch)}
            />
          )}
          {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}
          <p className="text-xs text-[#9299B5]">
            Prefer the full form?{" "}
            <Link href="/trips/new?wizard=1" className="text-[#0400FF]">
              Open advanced planner
            </Link>
          </p>
        </section>
      ) : null}

      {stage === "destinations" ? (
        <section className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#080B3A]">
            Where should this trip go?
          </h2>
          <p className="text-sm text-[#6B7280]">
            Pick one or more destinations.{" "}
            <Link href="/discover" className="text-[#0400FF]">
              Open full Discover
            </Link>{" "}
            to compare more.
          </p>
          {busy && !destinations.length ? (
            <p className="text-sm text-[#6B7280]">Loading recommendations…</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {destinations.map((destination) => (
              <DestinationCard
                key={destination.id}
                destination={destination}
                selected={selectedDestIds.includes(destination.id)}
                selectLabel="Add to trip"
                selectedLabel="In trip"
                onToggleCompare={(id) =>
                  setSelectedDestIds((prev) =>
                    prev.includes(id)
                      ? prev.filter((x) => x !== id)
                      : [...prev, id],
                  )
                }
              />
            ))}
          </div>
          {!destinations.length && !busy ? (
            <p className="text-sm text-[#6B7280]">
              No catalog matches yet — try a more specific idea, or continue if
              you already have cities from parsing.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStage("dream")}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void confirmDestinations()}
            >
              {busy ? "…" : "Continue to nights"}
            </Button>
          </div>
          {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}
        </section>
      ) : null}

      {stage === "decide" && allocation ? (
        <section className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#080B3A]">
            How long in each city?
          </h2>
          <p className="text-sm text-[#6B7280]">{allocation.summary}</p>
          {lockNote ? (
            <p className="rounded-[10px] bg-[#F5F7FF] px-3 py-2 text-xs text-[#0400FF]">
              {lockNote}
            </p>
          ) : null}
          <label className="block text-sm text-[#6B7280]">
            Trip start
            <input
              type="date"
              value={sanitizeTripDate(startDate) || startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="ml-2 rounded-[8px] border border-[#D1D7E5] px-2 py-1 text-[#080B3A]"
            />
          </label>
          <ul className="space-y-3">
            {allocation.cities.map((city, index) => {
              const next = allocation.cities[index + 1];
              const transit = next
                ? catalogTransitNote(next.city) || catalogTransitNote(city.city)
                : catalogTransitNote(city.city);
              return (
                <li
                  key={city.city}
                  className="rounded-[12px] border border-[#E1E5F0] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#080B3A]">
                        {city.city}
                        {city.country ? (
                          <span className="font-normal text-[#6B7280]">
                            {" "}
                            · {city.country}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-[#6B7280]">{city.why}</p>
                      {transit ? (
                        <p className="mt-1 text-[11px] text-[#9299B5]">
                          {next
                            ? `Toward ${next.city}: ${transit}`
                            : `Getting around: ${transit}`}
                        </p>
                      ) : null}
                    </div>
                    <label className="text-xs font-semibold text-[#6B7280]">
                      Nights
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={city.nights}
                        onChange={(e) =>
                          updateCityNights(city.city, Number(e.target.value))
                        }
                        className="ml-2 w-16 rounded-[8px] border border-[#D1D7E5] px-2 py-1 text-sm text-[#080B3A]"
                      />
                    </label>
                  </div>
                  {locked[city.city] ? (
                    <p className="mt-1 text-[11px] text-[#0400FF]">Locked</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void recalculate(allocation.cities)}
            >
              {busy ? "…" : "Recalculate unlocked cities"}
            </Button>
            <Button type="button" onClick={() => setStage("places")}>
              Continue to places
            </Button>
          </div>
          {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}
        </section>
      ) : null}

      {stage === "places" ? (
        <section className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#080B3A]">
            Must-visit places
          </h2>
          <p className="text-sm text-[#6B7280]">
            Toggle highlights to keep or skip. Selected places become must-sees
            in the organizer.
          </p>
          <ul className="space-y-2">
            {picks.map((pick, index) => {
              const photo = destinationImageUrl(
                `${pick.city}, ${
                  DESTINATION_CATALOG.find((d) => d.name === pick.city)
                    ?.country ?? ""
                }`,
              );
              return (
                <li key={`${pick.city}-${pick.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setPicks((prev) =>
                        prev.map((p, i) =>
                          i === index ? { ...p, selected: !p.selected } : p,
                        ),
                      )
                    }
                    className={`flex w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left ${
                      pick.selected
                        ? "border-[#0400FF]/40 bg-[#F5F7FF]"
                        : "border-[#E1E5F0] bg-white opacity-70"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt=""
                      className="h-12 w-16 shrink-0 rounded-[8px] object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#080B3A]">
                        {pick.name}
                      </p>
                      <p className="text-xs text-[#6B7280]">{pick.city}</p>
                    </div>
                    <span className="ml-auto text-xs font-semibold text-[#0400FF]">
                      {pick.selected ? "Must-visit" : "Skip"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!picks.length ? (
            <p className="text-sm text-[#6B7280]">
              No catalog highlights yet — you can still build and add places
              later.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStage("decide")}
            >
              Back
            </Button>
            <Button type="button" onClick={() => setStage("book")}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {stage === "book" ? (
        <section className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#080B3A]">
            Any bookings yet?
          </h2>
          <p className="text-sm text-[#6B7280]">
            Optional — paste a flight or hotel confirmation. The organizer will
            apply it when you build. You can also{" "}
            <Link href="/future-plans" className="text-[#0400FF]">
              import more later on Future Plans
            </Link>
            .
          </p>
          <textarea
            value={bookingPaste}
            onChange={(e) => setBookingPaste(e.target.value)}
            rows={5}
            placeholder="Paste confirmation text (optional)…"
            className="w-full rounded-[12px] border border-[#D1D7E5] px-3.5 py-3 text-sm text-[#080B3A] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStage("places")}
            >
              Back
            </Button>
            <Button type="button" onClick={() => setStage("organize")}>
              {bookingPaste.trim() ? "Use booking & continue" : "Skip for now"}
            </Button>
          </div>
        </section>
      ) : null}

      {stage === "organize" && allocation ? (
        <section className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#080B3A]">
            Ready to organize
          </h2>
          <p className="text-sm text-[#6B7280]">
            We&apos;ll open the planner with your cities, nights, and must-visits,
            then build a day-by-day schedule you can edit and optimize later.
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase text-[#9299B5]">
                Route
              </dt>
              <dd className="font-medium text-[#080B3A]">
                {allocation.cities.map((c) => c.city).join(" → ")}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-[#9299B5]">
                Dates
              </dt>
              <dd className="font-medium text-[#080B3A]">
                {startDate} → {endDate} · {totalNights} nights
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-[#9299B5]">
                Must-visits
              </dt>
              <dd className="font-medium text-[#080B3A]">
                {picks.filter((p) => p.selected).length}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStage("book")}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void saveForLater()}
            >
              Save for later
            </Button>
            <Button
              type="button"
              onClick={() => router.push(buildWizardHref())}
            >
              Build itinerary
            </Button>
          </div>
          {saveNote ? (
            <p className="text-sm text-[#059669]">
              {saveNote} —{" "}
              <Link href="/future-plans" className="text-[#0400FF]">
                Open Future Plans
              </Link>
            </p>
          ) : null}
          {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
