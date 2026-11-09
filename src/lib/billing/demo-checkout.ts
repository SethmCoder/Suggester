import { LIST_PRICES } from "@/lib/billing/limits";
import type { ProCheckoutInterval } from "@/lib/billing/stripe";

export type DemoCheckoutInterval = ProCheckoutInterval;

export function demoCheckoutAmount(interval: DemoCheckoutInterval): {
  dollars: number;
  label: string;
  cadence: string;
} {
  if (interval === "year") {
    return {
      dollars: LIST_PRICES.proAnnualUsd,
      label: `$${LIST_PRICES.proAnnualUsd.toFixed(2)}`,
      cadence: "billed yearly",
    };
  }
  return {
    dollars: LIST_PRICES.proMonthlyUsd,
    label: `$${LIST_PRICES.proMonthlyUsd.toFixed(2)}`,
    cadence: "billed monthly",
  };
}

export function demoCheckoutProductName(interval: DemoCheckoutInterval): string {
  return interval === "year" ? "Waypoint Pro (annual)" : "Waypoint Pro";
}

/** Masked sample PAN shown in the demo form — never charged. */
export const DEMO_CARD_PLACEHOLDER = "4242 4242 4242 4242";
