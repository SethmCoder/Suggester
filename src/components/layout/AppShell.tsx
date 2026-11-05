"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AvatarMenu } from "./AvatarMenu";
import { FirstRunTour } from "@/components/tutorial/FirstRunTour";
import { Button } from "@/components/ui/Button";
import {
  IconBell,
  IconHelp,
  IconHome,
  IconMap,
  IconMenu,
  IconPin,
  IconPlane,
  IconSearch,
  IconSettings,
  IconUser,
} from "@/components/ui/Icons";

const NAV = [
  { href: "/dashboard", label: "Home", icon: IconHome },
  { href: "/dashboard", label: "My Trips", icon: IconMap, hash: "trips" },
  { href: "/saved-places", label: "Saved Places", icon: IconPin },
  { href: "/profile", label: "Profile", icon: IconUser },
  { href: "/plan", label: "Plans", icon: IconPlane },
  { href: "/help", label: "Help & Support", icon: IconHelp },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

export function AppShell({
  children,
  userEmail,
  displayName,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  displayName?: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const first = (displayName || userEmail || "S").charAt(0).toUpperCase();

  function isActive(href: string, label: string) {
    if (label === "Home") return pathname === "/dashboard";
    if (label === "My Trips") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebar = (
    <aside className="flex h-full w-[260px] flex-col bg-[#080B3A] text-white">
      <Link
        href="/dashboard"
        className="mx-4 mt-4 mb-2 flex items-center gap-2.5 rounded-[12px] border border-[#292F68] bg-white px-3 py-2.5 transition hover:border-[#0400FF]/50"
        onClick={() => setMobileOpen(false)}
        aria-label="Waypoint home"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/waypoint-mark.png"
          alt=""
          className="h-9 w-auto object-contain"
        />
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-[#080B3A]">
            Waypoint
          </p>
          <p className="text-[10px] text-[#6B7280]">Back to start</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = isActive(item.href, item.label);
          const Icon = item.icon;
          const tourId =
            item.label === "Home"
              ? "tour-nav-home"
              : item.label === "Saved Places"
                ? "tour-nav-saved"
                : item.label === "Help & Support"
                  ? "tour-nav-help"
                  : undefined;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              data-tour={tourId}
              className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#0400FF] text-white shadow-lg shadow-[#0400FF]/25"
                  : "text-[#C5CAE5] hover:bg-[#20276D] hover:text-white"
              }`}
            >
              <Icon size={18} className={active ? "text-white" : "text-[#9299B5]"} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className="m-4 rounded-[14px] border border-[#292F68] bg-[#11165A] p-4"
        data-tour="tour-create-trip"
      >
        <p className="text-sm font-semibold text-white">
          Plan your next adventure with AI
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#C5CAE5]">
          Personalized day-by-day itineraries, optimized for how you travel.
        </p>
        <Link href="/trips/new" onClick={() => setMobileOpen(false)}>
          <Button className="mt-3 w-full" variant="primary">
            <IconPlane size={16} />
            Create a Trip
          </Button>
        </Link>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-[#F5F7FF]">
      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen shrink-0 md:block">
        {sidebar}
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#080B3A]/50"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[#E1E5F0] bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              className="rounded-lg p-2 text-[#080B3A] hover:bg-[#DDE1FF] md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <IconMenu size={20} />
            </button>

            <div className="relative min-w-0 flex-1 max-w-xl">
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9299B5]"
              />
              <input
                type="search"
                placeholder="Search trips, places, plans…"
                className="h-10 w-full rounded-[12px] border border-[#D1D7E5] bg-[#F5F7FF] pl-9 pr-3 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
              />
            </div>

            <button
              type="button"
              className="relative rounded-full p-2 text-[#6B7280] hover:bg-[#DDE1FF] hover:text-[#080B3A]"
              aria-label="Notifications"
            >
              <IconBell size={18} />
            </button>

            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0400FF] text-sm font-bold text-white">
                {first}
              </div>
              <AvatarMenu email={userEmail} displayName={displayName} />
            </div>
            <div className="sm:hidden">
              <AvatarMenu email={userEmail} displayName={displayName} />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <FirstRunTour />
    </div>
  );
}
