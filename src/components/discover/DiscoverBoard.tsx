"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DestinationCard } from "@/components/discover/DestinationCard";
import type { DiscoverSection } from "@/lib/discover/types";
import { listItems } from "@/lib/wishlist/store";
import { listFutureTrips } from "@/lib/future-trips/store";
import { emptyTraveler, TRAVELER_STORAGE_KEY, type TravelerProfile } from "@/lib/profile/traveler";
import {
  effectiveInterests,
  readIntelligence,
} from "@/lib/intelligence/store";
import { loadIntelligence } from "@/lib/intelligence/sync";

const PROMPTS = [
  "Find somewhere warm in February.",
  "I have $2,500 and want to travel internationally for 10 days.",
  "Find destinations with excellent architecture and history.",
  "Show me somewhere similar to Kyoto but less crowded.",
  "Find interesting cities with aviation attractions.",
];

function readTraveler(): TravelerProfile {
  if (typeof window === "undefined") return emptyTraveler();
  try {
    const raw = localStorage.getItem(TRAVELER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TravelerProfile) : emptyTraveler();
  } catch {
    return emptyTraveler();
  }
}

export function DiscoverBoard() {
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<DiscoverSection[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [budgetMax, setBudgetMax] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [seasonMonth, setSeasonMonth] = useState("");
  const [whyLines, setWhyLines] = useState<string[]>([]);
  const [intelReady, setIntelReady] = useState(false);

  const context = useMemo(() => {
    const saved = listItems();
    const futures = listFutureTrips();
    const traveler = readTraveler();
    const intel = readIntelligence();
    return {
      savedNames: saved.map((item) => item.name),
      previousDestinations: [
        ...futures.map((trip) => trip.destination),
        ...saved.map((item) => item.location || item.name),
        ...intel.inferred.previousDestinations,
      ].filter(Boolean) as string[],
      preferredDestinations: intel.inferred.preferredDestinations,
      downrankedInterests: intel.inferred.downrankedInterests
        .filter((row) => row.evidence >= 2)
        .map((row) => row.interest),
      dream: traveler.dream ?? intel.explicit.favoriteExperiences[0],
      interests: [
        ...effectiveInterests(intel),
        ...traveler.answers
          .flatMap((answer) => answer.answer.toLowerCase().split(/\W+/))
          .filter(Boolean),
      ],
      personalizationEnabled: intel.personalizationEnabled,
      budgetMax: intel.explicit.budgetMax,
      durationDays: intel.explicit.preferredDurationDays,
      explanations: intel.explanations,
    };
  }, [intelReady]);

  async function run(nextQuery?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nextQuery ?? query,
          budgetMax: budgetMax
            ? Number(budgetMax)
            : context.budgetMax ?? undefined,
          durationDays: durationDays
            ? Number(durationDays)
            : context.durationDays ?? undefined,
          seasonMonth: seasonMonth ? Number(seasonMonth) : undefined,
          savedNames: context.savedNames,
          previousDestinations: context.previousDestinations,
          preferredDestinations: context.preferredDestinations,
          downrankedInterests: context.downrankedInterests,
          dream: context.dream,
          interests: context.interests,
          personalizationEnabled: context.personalizationEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load destinations");
      setSections(data.sections ?? []);
      setNotice(data.notice ?? null);
      setWhyLines(context.explanations.slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load destinations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIntelligence()
      .then(({ profile }) => {
        setWhyLines(profile.explanations.slice(0, 4));
        setIntelReady(true);
      })
      .catch(() => setIntelReady(true));
  }, []);

  useEffect(() => {
    if (!intelReady) return;
    void run("Destinations that fit my saved interests");
    // initial personalized load once intelligence is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelReady]);

  function toggleCompare(id: string) {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">Discover</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#6B7280]">
            Find destinations from your interests, budget, season, and saved places — not a generic top-ten list.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/wishlist">
            <Button variant="secondary">Wishlist</Button>
          </Link>
          <Link
            href={
              compareIds.length >= 2
                ? `/discover/compare?ids=${compareIds.join(",")}`
                : "/discover/compare"
            }
          >
            <Button disabled={compareIds.length < 2}>
              Compare {compareIds.length ? `(${compareIds.length})` : ""}
            </Button>
          </Link>
        </div>
      </div>

      <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
        <label className="block text-sm font-semibold text-[#080B3A]">
          Ask in plain language
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Find somewhere warm in February'
            className="min-w-0 flex-1 rounded-[10px] border border-[#E1E5F0] px-3 py-2.5 text-sm"
          />
          <Button type="button" onClick={() => void run()} disabled={loading}>
            {loading ? "Searching…" : "Discover"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-[#D7DEFF] px-3 py-1 text-xs text-[#0400FF]"
              onClick={() => {
                setQuery(prompt);
                void run(prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={budgetMax}
            onChange={(event) => setBudgetMax(event.target.value)}
            placeholder="Budget ceiling (optional)"
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          />
          <input
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
            placeholder="Days available"
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          />
          <select
            value={seasonMonth}
            onChange={(event) => setSeasonMonth(event.target.value)}
            className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          >
            <option value="">Travel month (optional)</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>
                {new Date(2026, index, 1).toLocaleString("en", { month: "long" })}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F6FF] px-4 py-3 text-sm text-[#080B3A]">
          {notice}
        </p>
      ) : null}
      {whyLines.length ? (
        <div className="rounded-[12px] border border-[#E1E5F0] bg-white px-4 py-3 text-sm text-[#374151]">
          <p className="font-semibold text-[#080B3A]">Why these recommendations</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {whyLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Link href="/profile" className="mt-2 inline-block text-sm font-semibold text-[#0400FF]">
            Manage travel preferences →
          </Link>
        </div>
      ) : null}

      {loading && !sections.length ? (
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
          Ranking destinations…
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-[#080B3A]">{section.title}</h2>
            <p className="text-sm text-[#6B7280]">{section.description}</p>
          </div>
          {section.destinations.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.destinations.map((destination) => (
                <DestinationCard
                  key={`${section.id}-${destination.id}`}
                  destination={destination}
                  selected={compareIds.includes(destination.id)}
                  onToggleCompare={toggleCompare}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6B7280]">No matches in this section for the current filters.</p>
          )}
        </section>
      ))}
    </div>
  );
}
