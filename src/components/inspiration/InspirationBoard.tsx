"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DestinationCard } from "@/components/discover/DestinationCard";
import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import { rankDestinations } from "@/lib/discover/score";
import type {
  DestinationRecommendation,
  DiscoverInterest,
  DiscoveryFilters,
} from "@/lib/discover/types";

/**
 * Year-round destination inspiration from the existing Discover catalog.
 * No invented destinations — only curated catalog rows ranked for browsing.
 */
export function InspirationBoard() {
  const [query, setQuery] = useState("");

  const destinations = useMemo((): DestinationRecommendation[] => {
    const q = query.trim().toLowerCase();
    const filters: DiscoveryFilters = {
      interests: [] as DiscoverInterest[],
      query: q || undefined,
    };
    const ranked = rankDestinations(DESTINATION_CATALOG, filters, {}, 24);
    if (!q) return ranked;
    return ranked.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.country.toLowerCase().includes(q) ||
        d.experiences.some((e) => e.toLowerCase().includes(q)) ||
        d.attractions.some((a) => a.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#080B3A]">
            Inspiration
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#6B7280]">
            Browse destinations from the Discover catalog. Save ideas to
            Collections when something sticks.
          </p>
        </div>
        <Link
          href="/wishlist"
          className="text-sm font-semibold text-[#0400FF] underline-offset-2 hover:underline"
        >
          Open Collections
        </Link>
      </div>

      <div className="max-w-md">
        <label htmlFor="inspiration-search" className="sr-only">
          Filter destinations
        </label>
        <input
          id="inspiration-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by city, country, or experience…"
          className="h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3.5 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
        />
      </div>

      {destinations.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
          No catalog destinations match that filter.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {destinations.map((destination) => (
            <DestinationCard key={destination.id} destination={destination} />
          ))}
        </div>
      )}

      <p className="text-xs text-[#9299B5]">
        Sourced from Waypoint’s destination catalog (same data as Discover). Save
        go to Collections.
      </p>
    </div>
  );
}
