"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { IconExternalLink } from "@/components/ui/Icons";
import type { DestinationComparison } from "@/lib/discover/types";
import { SCORING_METHODOLOGY } from "@/lib/discover/types";
import { listItems } from "@/lib/wishlist/store";
import { saveWishlistItem } from "@/lib/wishlist/sync";
import { saveFutureTrip } from "@/lib/future-trips/sync";
import { TRAVELER_STORAGE_KEY, emptyTraveler, type TravelerProfile } from "@/lib/profile/traveler";
import { PLAN_LIMITS } from "@/lib/billing/limits";

const INTEREST_OPTIONS = [
  "architecture",
  "history",
  "food",
  "nature",
  "aviation",
  "beaches",
  "culture",
  "museums",
  "adventure",
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

export function CompareBoard() {
  const searchParams = useSearchParams();
  const [compareCap, setCompareCap] = useState<number>(PLAN_LIMITS.free.compareDestinations);
  const defaultSeed = "tokyo,rome";
  const initialIds = (searchParams.get("ids") || defaultSeed)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, PLAN_LIMITS.pro.compareDestinations);

  const [ids, setIds] = useState(initialIds.join(", "));
  const [interests, setInterests] = useState<string[]>(["architecture", "history", "food"]);
  const [budgetMax, setBudgetMax] = useState("3000");
  const [durationDays, setDurationDays] = useState("10");
  const [seasonMonth, setSeasonMonth] = useState("");
  const [comparisons, setComparisons] = useState<DestinationComparison[]>([]);
  const [methodology, setMethodology] = useState(SCORING_METHODOLOGY);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const context = useMemo(() => {
    const traveler = readTraveler();
    return {
      savedNames: listItems().map((item) => item.name),
      dream: traveler.dream,
      previousDestinations: listItems()
        .map((item) => item.location || item.name)
        .filter(Boolean) as string[],
    };
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const destinations = ids
        .split(/[,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, compareCap);
      if (destinations.length < 2) {
        throw new Error("Enter at least two destinations to compare.");
      }
      const res = await fetch("/api/discover/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinations,
          interests,
          budgetMax: budgetMax ? Number(budgetMax) : undefined,
          durationDays: durationDays ? Number(durationDays) : undefined,
          seasonMonth: seasonMonth ? Number(seasonMonth) : undefined,
          ...context,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not compare destinations");
      setComparisons(data.comparisons ?? []);
      setMethodology(data.methodology ?? SCORING_METHODOLOGY);
      setNotice(data.notice ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compare destinations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetch("/api/billing")
      .then((res) => res.json())
      .then((data: { entitled?: boolean }) => {
        const cap = data.entitled
          ? PLAN_LIMITS.pro.compareDestinations
          : PLAN_LIMITS.free.compareDestinations;
        setCompareCap(cap);
        setIds((current) =>
          current
            .split(/[,]+/)
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, cap)
            .join(", "),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareCap]);

  function toggleInterest(interest: string) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((value) => value !== interest)
        : [...current, interest],
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/discover" className="inline-flex items-center gap-1 text-sm font-medium text-[#0400FF]">
            ← Discover
            <IconExternalLink size={11} className="opacity-80" aria-hidden />
          </Link>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-[#1F2937]">
            Compare destinations
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#6B7280]">
            Side-by-side fit against your interests, budget ceiling, and available days. Scores use your inputs and our destination catalog.
            Free compares up to {PLAN_LIMITS.free.compareDestinations}; Plus up to{" "}
            {PLAN_LIMITS.pro.compareDestinations}.
          </p>
        </div>
      </div>

      <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
        <label className="text-sm font-semibold text-[#080B3A]">
          Destinations (2–{compareCap})
        </label>
        <input
          value={ids}
          onChange={(event) => setIds(event.target.value)}
          className="mt-2 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
          placeholder="tokyo, rome"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((interest) => {
            const active = interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={`rounded-full px-3 py-1 text-xs ${
                  active ? "bg-[#0400FF] text-white" : "border border-[#E1E5F0] text-[#374151]"
                }`}
              >
                {interest}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={budgetMax}
            onChange={(event) => setBudgetMax(event.target.value)}
            placeholder="Budget ceiling"
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
            <option value="">Month (optional)</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>
                {new Date(2026, index, 1).toLocaleString("en", { month: "long" })}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <Button type="button" onClick={() => void run()} disabled={loading}>
            {loading ? "Updating…" : "Update comparison"}
          </Button>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-[#6B7280]">{methodology}</p>
      {notice ? (
        <p className="rounded-[12px] border border-[#DDE1FF] bg-[#F5F6FF] px-4 py-3 text-sm text-[#080B3A]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-[#059669]">{message}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {comparisons.map((row) => (
          <article
            key={row.destination.id}
            className="overflow-hidden rounded-[16px] border border-[#E1E5F0] bg-white shadow-[0_4px_20px_rgba(8,11,58,0.04)]"
          >
            <div className="h-36 bg-[#080B3A]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.destination.photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-[#1F2937]">
                    {row.destination.name}
                  </h2>
                  <p className="text-sm text-[#6B7280]">{row.destination.country}</p>
                </div>
                <div className="rounded-[10px] bg-[#DDE1FF] px-2.5 py-1 text-center">
                  <p className="text-lg font-bold text-[#0400FF]">{row.suitabilityPercent}%</p>
                  <p className="text-[10px] uppercase tracking-wide text-[#080B3A]">fit</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-[#4B5563]">
                <div>
                  <dt className="text-[#6B7280]">Interest</dt>
                  <dd>{Math.round(row.suitabilityBreakdown.interest * 100)}%</dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Budget band</dt>
                  <dd>{Math.round(row.suitabilityBreakdown.budget * 100)}%</dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Duration</dt>
                  <dd>{Math.round(row.suitabilityBreakdown.duration * 100)}%</dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Season tag</dt>
                  <dd>{Math.round(row.suitabilityBreakdown.season * 100)}%</dd>
                </div>
              </dl>
              <p className="text-sm text-[#374151]">{row.destination.budgetNote}</p>
              <p className="text-xs text-[#6B7280]">{row.destination.seasonsNote}</p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0400FF]">
                  Advantages for you
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-[#374151]">
                  {row.advantages.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  Disadvantages
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-[#374151]">
                  {row.disadvantages.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void saveWishlistItem({
                      name: row.destination.name,
                      location: `${row.destination.name}, ${row.destination.country}`,
                      category: "destination",
                      description: row.advantages.join(" "),
                      photoUrl: row.destination.photoUrl,
                      externalPlaceId: `discover:${row.destination.id}`,
                      priority: "high",
                    }).then(() => setMessage(`Saved ${row.destination.name} to Collections`));
                  }}
                >
                  Save to Collections
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void saveFutureTrip({
                      destination: row.destination.name,
                      title: `${row.destination.name} from comparison`,
                      status: "comparing",
                      estimatedDurationDays: durationDays ? Number(durationDays) : 7,
                      budget: budgetMax ? Number(budgetMax) : null,
                      interests,
                      notes: [
                        `Suitability ${row.suitabilityPercent}% under current criteria.`,
                        ...row.advantages,
                        row.destination.budgetNote,
                      ].join("\n"),
                    }).then((trip) => {
                      window.location.href = `/future-trips/${trip.id}`;
                    });
                  }}
                >
                  Create Future Trip
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
