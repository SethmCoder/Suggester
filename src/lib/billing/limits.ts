import {
  FREE_AI_LIMIT,
  PRO_AI_LIMIT,
  PRO_PRICE_ANNUAL_USD,
  PRO_PRICE_USD,
} from "@/lib/billing/entitlements";
import { FREE_TRIP_LIMIT } from "@/lib/billing/plans";

/** Single place for Free vs Pro product limits and list prices. */
export const PLAN_LIMITS = {
  free: {
    trips: FREE_TRIP_LIMIT,
    aiRequestsPerMonth: FREE_AI_LIMIT,
    wishlistCollections: 5,
    compareDestinations: 2,
    discoverSections: "basic" as const,
    advancedWizard: false,
    multiCity: true,
    generate: true,
    personalizedDiscovery: "basic" as const,
  },
  pro: {
    trips: null as number | null,
    aiRequestsPerMonth: PRO_AI_LIMIT,
    wishlistCollections: null as number | null,
    compareDestinations: 4,
    discoverSections: "advanced" as const,
    advancedWizard: true,
    multiCity: true,
    generate: true,
    personalizedDiscovery: "advanced" as const,
  },
} as const;

export const LIST_PRICES = {
  proMonthlyUsd: PRO_PRICE_USD,
  proAnnualUsd: PRO_PRICE_ANNUAL_USD,
} as const;

export function planCopy(pro: boolean) {
  if (pro) {
    return {
      title: "Pro",
      priceMonthly: LIST_PRICES.proMonthlyUsd,
      priceAnnual: LIST_PRICES.proAnnualUsd,
      bullets: [
        "Advanced personalized discovery and comparisons",
        "Expanded Wishlist and Future Trip tools",
        "Unlimited generated trips and Trip Wizard",
        "Constraint-aware planning and multi-city trips",
        `${PLAN_LIMITS.pro.aiRequestsPerMonth} AI requests / month`,
      ],
    };
  }
  return {
    title: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    bullets: [
      `${PLAN_LIMITS.free.trips} generated trips`,
      "Basic Discover, Wishlist, and Future Trips",
      "Basic traveler preferences",
      `${PLAN_LIMITS.free.aiRequestsPerMonth} AI requests / month`,
      "Map and manual editing",
    ],
  };
}
