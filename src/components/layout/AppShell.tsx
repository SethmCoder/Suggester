"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type SVGProps } from "react";
import { AvatarMenu } from "./AvatarMenu";
import { UserAvatar } from "./UserAvatar";
import { FirstRunTour } from "@/components/tutorial/FirstRunTour";
import {
  IconBell,
  IconCompass,
  IconCredit,
  IconHelp,
  IconHome,
  IconMap,
  IconMenu,
  IconPin,
  IconPlane,
  IconSearch,
  IconSettings,
  IconSpark,
  IconUser,
} from "@/components/ui/Icons";

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  tour?: string;
  match?: "exact" | "prefix";
};

const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: IconHome, tour: "tour-nav-home", match: "exact" },
  { href: "/discover", label: "Discover", icon: IconCompass },
  { href: "/explore", label: "Explorer", icon: IconMap },
  { href: "/things", label: "Things", icon: IconSpark },
  { href: "/wishlist", label: "Wishlist", icon: IconPin, tour: "tour-nav-saved" },
  { href: "/future-trips", label: "Future Trips", icon: IconPlane },
];

const SECONDARY: NavItem[] = [
  { href: "/plan", label: "Plans", icon: IconCredit },
  { href: "/profile", label: "Profile", icon: IconUser },
  { href: "/help", label: "Help", icon: IconHelp, tour: "tour-nav-help" },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-tour={item.tour}
      className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-[#0400FF] text-white shadow-md shadow-[#0400FF]/20"
          : "text-[#C5CAE5] hover:bg-[#20276D] hover:text-white"
      }`}
    >
      <Icon size={17} className={active ? "text-white" : "text-[#9299B5]"} />
      {item.label}
    </Link>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-0.5">
      {label ? (
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
          {label}
        </p>
      ) : null}
      {items.map((item) => {
        const active =
          item.match === "exact"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <NavLink
            key={item.href + item.label}
            item={item}
            active={active}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
}

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
  const closeMobile = () => setMobileOpen(false);

  const sidebar = (
    <aside className="flex h-full w-[232px] flex-col bg-[#080B3A] text-white">
      <Link
        href="/dashboard"
        className="mx-3 mt-4 mb-1 flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 transition hover:bg-[#11165A]"
        onClick={closeMobile}
        aria-label="Waypoint home"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/waypoint-mark.png"
          alt=""
          className="h-8 w-auto object-contain"
        />
        <p className="text-sm font-bold tracking-tight text-white">Waypoint</p>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-2">
        <NavGroup items={PRIMARY} pathname={pathname} onNavigate={closeMobile} />
        <NavGroup
          label="Account"
          items={SECONDARY}
          pathname={pathname}
          onNavigate={closeMobile}
        />
      </nav>

      <div className="border-t border-[#292F68] p-3" data-tour="tour-create-trip">
        <Link
          href="/trips/new"
          onClick={closeMobile}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#0400FF] px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#0400FF]/25 transition hover:bg-[#0A0080]"
        >
          <IconPlane size={16} />
          Plan a trip
        </Link>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-[#F5F7FF]">
      <div className="sticky top-0 hidden h-screen shrink-0 md:block">
        {sidebar}
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#080B3A]/50"
            aria-label="Close menu"
            onClick={closeMobile}
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
              <UserAvatar
                displayName={displayName}
                email={userEmail}
                size="sm"
                listenForStorage
              />
              <AvatarMenu email={userEmail} displayName={displayName} />
            </div>
            <div className="sm:hidden">
              <UserAvatar
                displayName={displayName}
                email={userEmail}
                size="sm"
                className="mr-1"
                listenForStorage
              />
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
