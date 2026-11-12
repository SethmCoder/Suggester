"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type SVGProps } from "react";
import { AvatarMenu } from "./AvatarMenu";
import { HeaderSearch } from "./HeaderSearch";
import { NotificationsMenu } from "./NotificationsMenu";
import { UserAvatar } from "./UserAvatar";
import { DemoSessionGuard } from "@/components/demo/DemoSessionGuard";
import { FirstRunTour } from "@/components/tutorial/FirstRunTour";
import { LanguageProvider, useLanguage } from "@/components/i18n/LanguageProvider";
import {
  IconArchive,
  IconCompass,
  IconHelp,
  IconHome,
  IconMenu,
  IconPin,
  IconPlane,
  IconSettings,
  IconSpark,
  IconUser,
  IconUsers,
} from "@/components/ui/Icons";

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

type NavItem = {
  href: string;
  labelKey: string;
  icon: NavIcon;
  tour?: string;
  match?: "exact" | "prefix";
};

const PRIMARY: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.home", icon: IconHome, tour: "tour-nav-home", match: "exact" },
  { href: "/future-plans", labelKey: "nav.futurePlans", icon: IconPlane },
  { href: "/wishlist", labelKey: "nav.wishlist", icon: IconPin, tour: "tour-nav-saved" },
  { href: "/discover", labelKey: "nav.discover", icon: IconCompass },
  { href: "/inspiration", labelKey: "nav.inspiration", icon: IconSpark },
  { href: "/archive", labelKey: "nav.archive", icon: IconArchive },
  { href: "/friends", labelKey: "nav.friends", icon: IconUsers },
];

const SECONDARY: NavItem[] = [
  { href: "/profile", labelKey: "nav.profile", icon: IconUser },
  { href: "/help", labelKey: "nav.help", icon: IconHelp, tour: "tour-nav-help" },
  { href: "/settings", labelKey: "nav.settings", icon: IconSettings },
];

function NavLink({
  item,
  active,
  onNavigate,
  label,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
  label: string;
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
      {label}
    </Link>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
  t,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-0.5">
      {label ? (
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9299B5]">
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
            key={item.href + item.labelKey}
            item={item}
            label={t(item.labelKey)}
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
  userId,
  isDemo = false,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  displayName?: string | null;
  userId?: string | null;
  isDemo?: boolean;
}) {
  return (
    <LanguageProvider>
      <AppShellInner
        userEmail={userEmail}
        displayName={displayName}
        userId={userId}
        isDemo={isDemo}
      >
        {children}
      </AppShellInner>
    </LanguageProvider>
  );
}

function AppShellInner({
  children,
  userEmail,
  displayName,
  userId,
  isDemo,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  displayName?: string | null;
  userId?: string | null;
  isDemo?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
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
        <NavGroup
          items={PRIMARY}
          pathname={pathname}
          onNavigate={closeMobile}
          t={t}
        />
        <NavGroup
          label={t("nav.account")}
          items={SECONDARY}
          pathname={pathname}
          onNavigate={closeMobile}
          t={t}
        />
      </nav>

      <div className="space-y-2 border-t border-[#292F68] p-3" data-tour="tour-create-trip">
        <Link
          href="/future-plans"
          onClick={closeMobile}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#0400FF] px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#0400FF]/25 transition hover:bg-[#0A0080]"
        >
          <IconPlane size={16} />
          {t("nav.futurePlans")}
        </Link>
        <Link
          href="/trips/new"
          onClick={closeMobile}
          className="block text-center text-[11px] font-medium text-[#9299B5] transition hover:text-white"
        >
          {t("nav.haveDates")}
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
        <header className="sticky top-0 z-30 border-b border-[#E1E5F0]/90 bg-white/90 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              className="rounded-lg p-2 text-[#080B3A] hover:bg-[#DDE1FF] md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <IconMenu size={20} />
            </button>

            <HeaderSearch />
            <NotificationsMenu />

            <div className="hidden items-center gap-2 sm:flex">
              <UserAvatar
                displayName={displayName}
                email={userEmail}
                userId={userId}
                size="sm"
                listenForStorage
              />
              <AvatarMenu email={userEmail} displayName={displayName} />
            </div>
            <div className="sm:hidden">
              <UserAvatar
                displayName={displayName}
                email={userEmail}
                userId={userId}
                size="sm"
                className="mr-1"
                listenForStorage
              />
              <AvatarMenu email={userEmail} displayName={displayName} />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{children}</main>
      </div>
      <FirstRunTour />
      {isDemo ? <DemoSessionGuard /> : null}
    </div>
  );
}
