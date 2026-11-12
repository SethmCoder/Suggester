"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconExternalLink } from "@/components/ui/Icons";
import { formatTripDate } from "@/lib/format-date";
import { nightsBetween, nightsLabel } from "@/lib/trips/dates";

type SectionId = "overview" | "itinerary" | "explore" | "details";

const SECTIONS: {
  id: SectionId;
  label: string;
  items: { href: string; label: string; hash?: string }[];
}[] = [
  {
    id: "overview",
    label: "Trip Overview",
    items: [{ href: "", label: "Overview", hash: "overview" }],
  },
  {
    id: "itinerary",
    label: "Itinerary",
    items: [
      { href: "", label: "Daily itinerary", hash: "itinerary" },
      { href: "", label: "Hotels", hash: "hotels" },
      { href: "", label: "Transportation", hash: "transit" },
      { href: "", label: "Budget", hash: "budget" },
      { href: "", label: "Packing", hash: "packing" },
    ],
  },
  {
    id: "explore",
    label: "Explore",
    items: [
      { href: "/things", label: "Things to do" },
      { href: "/explore", label: "Explorer" },
    ],
  },
  {
    id: "details",
    label: "Trip Details",
    items: [
      { href: "", label: "Flights & bookings", hash: "bookings" },
      { href: "", label: "Travel notes", hash: "notes" },
    ],
  },
];

export function TripPlanSidebar({
  tripId,
  destination,
  startDate,
  endDate,
  travelers,
  cities,
}: {
  tripId: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  travelers?: number | null;
  cities: string[];
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(true);
  const [hash, setHash] = useState("");
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>({
    overview: true,
    itinerary: true,
    explore: true,
    details: true,
  });

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash.replace(/^#/, ""));
    }
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

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

  function sectionLink(item: { href: string; hash?: string }) {
    if (item.href.startsWith("/")) {
      const q = new URLSearchParams(search?.toString() ?? "");
      q.set("trip", tripId);
      return `${item.href}?${q.toString()}`;
    }
    return item.hash ? `${tripBase}#${item.hash}` : tripBase;
  }

  function isActive(item: { href: string; hash?: string }) {
    if (item.href.startsWith("/")) {
      return pathname.startsWith(item.href);
    }
    if (item.hash) return hash === item.hash || (!hash && item.hash === "itinerary");
    return pathname === tripBase;
  }

  function goToSection(
    event: React.MouseEvent<HTMLAnchorElement>,
    item: { href: string; hash?: string },
  ) {
    if (item.href.startsWith("/")) return;
    event.preventDefault();
    const targetId = item.hash || "overview";
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const next = `${tripBase}#${targetId}`;
    window.history.replaceState(null, "", next);
    setHash(targetId);
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
        <div id="overview" className="mb-3 border-b border-[#F0F2F8] pb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Trip Overview
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
        <nav className="space-y-2">
          {SECTIONS.map((section) => (
            <div key={section.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[8px] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-[#6B7280] hover:bg-[#F5F7FF]"
                onClick={() =>
                  setExpanded((e) => ({ ...e, [section.id]: !e[section.id] }))
                }
              >
                {section.label}
                <span>{expanded[section.id] ? "−" : "+"}</span>
              </button>
              {expanded[section.id] ? (
                <ul className="mt-1 space-y-0.5 pl-1">
                  {section.items.map((item) => {
                    const href = sectionLink(item);
                    const active = isActive(item);
                    const leavesTrip = item.href.startsWith("/");
                    return (
                      <li key={`${section.id}-${item.label}`}>
                        <Link
                          href={href}
                          className={`flex items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 text-sm ${
                            active
                              ? "bg-[#0400FF] font-medium text-white"
                              : "text-[#374151] hover:bg-[#F5F7FF]"
                          }`}
                          onClick={(event) => goToSection(event, item)}
                        >
                          <span>{item.label}</span>
                          {leavesTrip ? (
                            <IconExternalLink
                              size={11}
                              className={active ? "text-white/80" : "text-[#9299B5]"}
                              aria-hidden
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </nav>
        <p className="mt-4 text-[11px] leading-snug text-[#9CA3AF]">
          Switching sections keeps your itinerary. Only Delete trip removes data.
        </p>
      </aside>
    </>
  );
}
