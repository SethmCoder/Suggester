"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTripDate } from "@/lib/format-date";
import { nightsBetween, nightsLabel } from "@/lib/trips/dates";

export type TripDashTab =
  | "overview"
  | "itinerary"
  | "discover"
  | "bookings"
  | "map"
  | "assistant";

const TABS: { id: TripDashTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "itinerary", label: "Itinerary" },
  { id: "discover", label: "Discover" },
  { id: "bookings", label: "Bookings" },
  { id: "map", label: "Map" },
  { id: "assistant", label: "Trip Assistant" },
];

export function TripPlanSidebar({
  tripId,
  destination,
  startDate,
  endDate,
  travelers,
  cities,
  activeTab,
  onTabChange,
}: {
  tripId: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  travelers?: number | null;
  cities: string[];
  activeTab?: TripDashTab;
  onTabChange?: (tab: TripDashTab) => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [hash, setHash] = useState<TripDashTab>("itinerary");

  useEffect(() => {
    function syncHash() {
      const raw = window.location.hash.replace(/^#/, "") as TripDashTab;
      if (TABS.some((t) => t.id === raw)) setHash(raw);
    }
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  const current = activeTab ?? hash;

  const nights =
    startDate && endDate
      ? (() => {
          try {
            return nightsBetween(startDate, endDate);
          } catch {
            return 0;
          }
        })()
      : 0;

  const tripBase = `/trips/${tripId}`;

  function selectTab(tab: TripDashTab) {
    const next = `${tripBase}#${tab}`;
    window.history.replaceState(null, "", next);
    setHash(tab);
    onTabChange?.(tab);
    window.dispatchEvent(
      new CustomEvent("waypoint:trip-section", { detail: { section: tab } }),
    );
  }

  return (
    <>
      <button
        type="button"
        className="mb-3 rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-2 text-sm font-semibold text-[#080B3A] lg:hidden"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide trip menu" : "Show trip menu"}
      </button>
      <aside
        className={`${
          open ? "block" : "hidden"
        } w-full shrink-0 rounded-[16px] border border-[#E1E5F0] bg-white p-3 shadow-[0_4px_16px_rgba(8,11,58,0.04)] lg:block lg:w-56`}
        data-tour="tour-trip-sidebar"
      >
        <div className="mb-3 border-b border-[#F0F2F8] pb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Trip
          </p>
          <p className="mt-1 text-sm font-semibold text-[#080B3A]">{destination}</p>
          {startDate && endDate ? (
            <p className="mt-1 text-xs text-[#6B7280]">
              {formatTripDate(startDate, "short")} –{" "}
              {formatTripDate(endDate, "long")}
              {nights > 0 ? ` · ${nightsLabel(nights)}` : ""}
            </p>
          ) : null}
          {cities.length ? (
            <p className="mt-1 text-xs text-[#6B7280]">{cities.join(" → ")}</p>
          ) : null}
          {travelers ? (
            <p className="mt-1 text-xs text-[#6B7280]">
              {travelers} traveler{travelers === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <nav className="space-y-0.5">
          {TABS.map((tab) => {
            const active = current === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-sm ${
                  active
                    ? "bg-[#0400FF] font-medium text-white"
                    : "text-[#374151] hover:bg-[#F5F7FF]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-4 space-y-1 border-t border-[#F0F2F8] pt-3">
          <Link
            href="/discover"
            className="block rounded-[8px] px-2.5 py-1.5 text-xs font-medium text-[#0400FF] hover:bg-[#F5F7FF]"
          >
            Destination Discover
          </Link>
          <Link
            href="/future-plans"
            className="block rounded-[8px] px-2.5 py-1.5 text-xs font-medium text-[#6B7280] hover:bg-[#F5F7FF]"
          >
            Future Trips
          </Link>
        </div>
        <p className="mt-4 text-[11px] leading-snug text-[#9CA3AF]">
          Switching tabs keeps your itinerary. Only Delete trip removes data.
        </p>
      </aside>
    </>
  );
}
