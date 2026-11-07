"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { DestinationRecommendation } from "@/lib/discover/types";
import { saveWishlistItem } from "@/lib/wishlist/sync";
import { saveFutureTrip } from "@/lib/future-trips/sync";

export function DestinationCard({
  destination,
  selected,
  onToggleCompare,
}: {
  destination: DestinationRecommendation;
  selected?: boolean;
  onToggleCompare?: (id: string) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveWish() {
    setBusy(true);
    setNote(null);
    try {
      await saveWishlistItem({
        name: destination.name,
        location: `${destination.name}, ${destination.country}`,
        category: "destination",
        description: destination.why.join(" "),
        photoUrl: destination.photoUrl,
        notes: destination.experiences.join("; "),
        priority: "medium",
        externalPlaceId: `discover:${destination.id}`,
      });
      void import("@/lib/intelligence/sync")
        .then(({ postIntelligenceSignal }) =>
          postIntelligenceSignal({
            type: "discover_save",
            destinationId: destination.id,
            interests: destination.experiences.slice(0, 6),
          }),
        )
        .catch(() => undefined);
      setNote("Saved to Wishlist");
    } finally {
      setBusy(false);
    }
  }

  async function createFuture() {
    setBusy(true);
    setNote(null);
    try {
      const trip = await saveFutureTrip({
        destination: destination.name,
        title: `${destination.name} idea`,
        status: "wishlist",
        estimatedDurationDays: Math.round(
          (Number(destination.durationNote.match(/\d+/)?.[0] || 5) + 2),
        ),
        notes: [
          destination.why.join(" "),
          `Experiences: ${destination.experiences.join(", ")}`,
          destination.budgetNote,
          destination.seasonsNote,
        ].join("\n"),
        interests: [],
        preferences: {
          fromDiscover: true,
          destinationId: destination.id,
          budgetNote: destination.budgetNote,
        },
      });
      setNote("Future trip created");
      window.location.href = `/future-trips/${trip.id}`;
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-[16px] border border-[#E1E5F0] bg-white shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
      <div className="relative h-40 bg-[#080B3A]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={destination.photoUrl} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#080B3A]/80 to-transparent px-3 py-2">
          <p className="text-lg font-semibold text-white">{destination.name}</p>
          <p className="text-xs text-[#C5CAE5]">{destination.country}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm text-[#374151]">{destination.why[0]}</p>
        <ul className="space-y-1 text-xs text-[#6B7280]">
          <li>
            <span className="font-medium text-[#1F2937]">Experiences:</span>{" "}
            {destination.experiences.join(" · ")}
          </li>
          <li>
            <span className="font-medium text-[#1F2937]">Attractions:</span>{" "}
            {destination.attractions.join(" · ")}
          </li>
          <li>
            <span className="font-medium text-[#1F2937]">Season:</span>{" "}
            {destination.seasonsNote}{" "}
            <span className="uppercase tracking-wide">({destination.seasonsConfidence})</span>
          </li>
          <li>
            <span className="font-medium text-[#1F2937]">Duration:</span>{" "}
            {destination.durationNote}{" "}
            <span className="uppercase tracking-wide">({destination.durationConfidence})</span>
          </li>
          <li>
            <span className="font-medium text-[#1F2937]">Budget:</span>{" "}
            {destination.budgetNote}{" "}
            <span className="uppercase tracking-wide">({destination.budgetConfidence})</span>
          </li>
          <li>
            <span className="font-medium text-[#1F2937]">Getting around:</span>{" "}
            {destination.transitNote}
          </li>
          {destination.disadvantages[0] ? (
            <li>
              <span className="font-medium text-[#1F2937]">Watch-outs:</span>{" "}
              {destination.disadvantages.join(" · ")}
            </li>
          ) : null}
          {destination.populationNote ? <li>{destination.populationNote}</li> : null}
        </ul>
        <p className="text-[11px] text-[#9CA3AF]">
          Sources: {destination.sources.join(", ")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveWish()}>
            Save to Wishlist
          </Button>
          {onToggleCompare ? (
            <Button
              type="button"
              variant={selected ? "primary" : "secondary"}
              onClick={() => onToggleCompare(destination.id)}
            >
              {selected ? "Selected" : "Compare"}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void createFuture()}>
            Create Future Trip
          </Button>
          <Link href={`/explore?city=${encodeURIComponent(destination.name)}`}>
            <Button type="button" variant="ghost">
              Explore
            </Button>
          </Link>
          <Link
            href={`/trips/new?destination=${encodeURIComponent(destination.name)}&days=${destination.durationNote.match(/\d+/)?.[0] || 5}`}
          >
            <Button type="button" variant="ghost">
              Preliminary itinerary
            </Button>
          </Link>
        </div>
        {note ? <p className="text-xs text-[#059669]">{note}</p> : null}
      </div>
    </article>
  );
}
