"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const DISMISSED_KEY = "waypoint:tour-dismissed-v2";
const STEP_KEY = "waypoint:tour-step-v2";

type TourStep = {
  title: string;
  body: string;
  /** Route to visit for this step */
  href: string;
  /** data-tour attribute value to spotlight */
  target?: string;
  placement?: "bottom" | "top" | "left" | "right";
};

const STEPS: TourStep[] = [
  {
    title: "Your home base",
    body: "This is your dashboard — recent trips, a local hero, and a quick jump into planning. Use the sidebar anytime to move around Waypoint.",
    href: "/dashboard",
    target: "tour-nav-home",
    placement: "right",
  },
  {
    title: "Your trips live here",
    body: "Open a saved or demo itinerary from My trips. The Paris demo works offline so you can explore without signing in.",
    href: "/dashboard",
    target: "tour-trips-list",
    placement: "top",
  },
  {
    title: "Trip Architect",
    body: "Start with an idea — Waypoint helps with destinations, nights per city, places, and a full itinerary you can edit.",
    href: "/trips/new",
    target: "tour-create-trip",
    placement: "bottom",
  },
  {
    title: "Day-by-day itinerary",
    body: "Each trip shows a schedule and map for the selected day. Drag stops, retimes, and save — including offline on this device.",
    href: "/trips/demo-paris",
    target: "tour-itinerary",
    placement: "bottom",
  },
  {
    title: "Meet Trip Wizard",
    body: "Delayed flight or a meal near your stops? Open Trip Wizard, review the suggested changes, then approve them to update the plan and map.",
    href: "/trips/demo-paris",
    target: "tour-assistant",
    placement: "left",
  },
  {
    title: "Collections & help",
    body: "Save travel ideas in Collections, sketch Future Trips before dates are set, tweak maps in Settings, and open Help anytime.",
    href: "/wishlist",
    target: "tour-nav-saved",
    placement: "right",
  },
];

function pathMatches(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readStep(): number {
  try {
    const n = Number(localStorage.getItem(STEP_KEY) ?? "0");
    if (Number.isFinite(n) && n >= 0 && n < STEPS.length) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

function writeStep(n: number) {
  try {
    localStorage.setItem(STEP_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function FirstRunTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<DOMRect | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
      const s = readStep();
      setStep(s);
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Keep the user on the route for the active step
  useEffect(() => {
    if (!open) return;
    const href = STEPS[step]?.href;
    if (!href) return;
    if (!pathMatches(pathname, href)) {
      router.push(href);
    }
  }, [open, step, pathname, router]);

  // Measure spotlight target after navigation / step change
  useLayoutEffect(() => {
    if (!open) {
      setSpot(null);
      return;
    }
    const target = STEPS[step]?.target;
    if (!target) {
      setSpot(null);
      return;
    }

    let tries = 0;
    let raf = 0;
    const measure = () => {
      let el = document.querySelector(
        `[data-tour="${target}"]`,
      ) as HTMLElement | null;
      // Sidebar targets are hidden on mobile until the drawer opens
      if (
        !el &&
        (target.startsWith("tour-nav") || target === "tour-create-trip")
      ) {
        const menu = document.querySelector(
          '[aria-label="Open menu"]',
        ) as HTMLButtonElement | null;
        menu?.click();
      }
      el = document.querySelector(
        `[data-tour="${target}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        setSpot(el.getBoundingClientRect());
        return;
      }
      setSpot(null);
      if (tries++ < 12) {
        raf = window.setTimeout(measure, 80);
      }
    };
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.clearTimeout(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step, pathname]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
      localStorage.removeItem(STEP_KEY);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function go(next: number) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
    writeStep(clamped);
    setStep(clamped);
    try {
      window.dispatchEvent(
        new CustomEvent("waypoint:tour-step", {
          detail: { step: clamped, target: STEPS[clamped].target },
        }),
      );
    } catch {
      /* ignore */
    }
    const href = STEPS[clamped].href;
    if (!pathMatches(pathname, href)) {
      router.push(href);
    }
  }

  if (!open) return null;

  const current = STEPS[step];
  const pad = 8;
  const cardStyle = positionCard(spot, current.placement ?? "bottom");

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {/* Dim + spotlight cutout */}
      <div className="pointer-events-auto absolute inset-0" aria-hidden>
        {spot ? (
          <svg className="h-full w-full">
            <defs>
              <mask id="tour-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={spot.left - pad}
                  y={spot.top - pad}
                  width={spot.width + pad * 2}
                  height={spot.height + pad * 2}
                  rx="14"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(8,11,58,0.55)"
              mask="url(#tour-mask)"
            />
            <rect
              x={spot.left - pad}
              y={spot.top - pad}
              width={spot.width + pad * 2}
              height={spot.height + pad * 2}
              rx="14"
              fill="none"
              stroke="#0400FF"
              strokeWidth="2"
            />
          </svg>
        ) : (
          <div className="h-full w-full bg-[#080B3A]/45" />
        )}
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="pointer-events-auto absolute z-[61] w-[min(100%-1.5rem,22rem)] rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_16px_48px_rgba(8,11,58,0.25)]"
        style={cardStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0400FF]">
          Waypoint tour · {step + 1}/{STEPS.length}
        </p>
        <h2
          id="tour-title"
          className="mt-1.5 text-[18px] font-semibold text-[#080B3A]"
        >
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
          {current.body}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm text-[#6B7280] hover:text-[#080B3A]"
            onClick={dismiss}
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => go(step - 1)}
              >
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => go(step + 1)}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={dismiss}>
                Finish
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function positionCard(
  spot: DOMRect | null,
  placement: "bottom" | "top" | "left" | "right",
): CSSProperties {
  const margin = 16;
  const width = Math.min(
    352,
    typeof window !== "undefined" ? window.innerWidth - 24 : 352,
  );

  if (!spot || typeof window === "undefined") {
    return { left: margin, bottom: margin };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (placement === "right") {
    const left = Math.min(spot.right + 14, vw - width - margin);
    const top = Math.min(
      Math.max(margin, spot.top),
      vh - 220,
    );
    return { left, top, width };
  }
  if (placement === "left") {
    const left = Math.max(margin, spot.left - width - 14);
    const top = Math.min(Math.max(margin, spot.top - 20), vh - 220);
    return { left, top, width };
  }
  if (placement === "top") {
    const left = Math.min(
      Math.max(margin, spot.left + spot.width / 2 - width / 2),
      vw - width - margin,
    );
    const top = Math.max(margin, spot.top - 200);
    return { left, top, width };
  }
  // bottom
  const left = Math.min(
    Math.max(margin, spot.left + spot.width / 2 - width / 2),
    vw - width - margin,
  );
  const top = Math.min(spot.bottom + 14, vh - 220);
  return { left, top, width };
}
