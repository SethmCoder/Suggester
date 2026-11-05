"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconPin } from "@/components/ui/Icons";
import {
  readSavedPlaces,
  removeSavedPlace,
  type SavedPlace,
} from "@/lib/places/saved-places";

export default function SavedPlacesPage() {
  const [places, setPlaces] = useState<SavedPlace[]>([]);

  useEffect(() => {
    setPlaces(readSavedPlaces());
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">
          Saved Places
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Places you save from a trip stay in this browser and can be added to a later plan.
        </p>
      </div>
      {places.length === 0 ? (
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-8 py-16 text-center shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DDE1FF] text-[#0400FF]">
            <IconPin size={22} />
          </div>
          <p className="text-lg font-semibold">No saved places yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
            Open a trip, choose a stop, and save it. It will be listed here.
          </p>
          <Link href="/dashboard" className="mt-6 inline-flex">
            <Button variant="secondary">Back to trips</Button>
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {places.map((place) => (
            <li
              key={place.id}
              className="flex items-start justify-between gap-3 rounded-[14px] border border-[#E1E5F0] bg-white p-4"
            >
              <div>
                <p className="font-semibold text-[#1F2937]">{place.name}</p>
                <p className="text-sm text-[#6B7280]">
                  {place.address || `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPlaces(removeSavedPlace(place.id))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
