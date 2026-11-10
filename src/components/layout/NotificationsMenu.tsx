"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconBell, IconExternalLink } from "@/components/ui/Icons";

const TIPS = [
  {
    title: "Plan your next trip",
    body: "Tell the agent where you’re going and generate a day-by-day itinerary.",
    href: "/trips/new",
  },
  {
    title: "Discover destinations",
    body: "Ask in plain language for places that fit your season and budget.",
    href: "/discover",
  },
  {
    title: "Forward a booking",
    body: "Future Plans stays empty until a confirmation email arrives.",
    href: "/future-plans",
  },
];

/** Working notifications control — tips when there are no live alerts. */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className="relative rounded-full p-2 text-[#6B7280] hover:bg-[#DDE1FF] hover:text-[#080B3A]"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <IconBell size={18} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_16px_40px_rgba(8,11,58,0.12)]"
        >
          <div className="border-b border-[#F0F2F8] px-4 py-3">
            <p className="text-sm font-semibold text-[#080B3A]">Notifications</p>
            <p className="mt-0.5 text-xs text-[#6B7280]">You’re all caught up.</p>
          </div>
          <ul className="max-h-80 overflow-auto py-1">
            {TIPS.map((tip) => (
              <li key={tip.href}>
                <Link
                  href={tip.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2 px-4 py-3 hover:bg-[#F5F7FF]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#080B3A]">{tip.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">{tip.body}</p>
                  </div>
                  <IconExternalLink
                    size={12}
                    className="mt-1 shrink-0 text-[#9299B5]"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
