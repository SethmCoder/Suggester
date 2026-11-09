import { describe, expect, it } from "vitest";
import {
  FREE_AI_LIMIT,
  PRO_AI_LIMIT,
  PRO_PRICE_ANNUAL_USD,
  PRO_PRICE_USD,
  PRO_REQUIRED_MESSAGE,
  gateFeature,
  isAdvancedRequest,
} from "@/lib/billing/entitlements";
import { LIST_PRICES, PLAN_LIMITS, planCopy } from "@/lib/billing/limits";
import { FREE_TRIP_LIMIT, canCreateTrip } from "@/lib/billing/plans";
import { proPriceData } from "@/lib/billing/stripe";

describe("billing and entitlements domain", () => {
  it("exposes Free trip and AI limits", () => {
    expect(FREE_TRIP_LIMIT).toBe(3);
    expect(FREE_AI_LIMIT).toBe(5);
    expect(PLAN_LIMITS.free.trips).toBe(3);
    expect(PLAN_LIMITS.free.aiRequestsPerMonth).toBe(5);
  });

  it("exposes Pro AI limit and unlimited trips", () => {
    expect(PRO_AI_LIMIT).toBe(80);
    expect(PLAN_LIMITS.pro.trips).toBeNull();
    expect(PLAN_LIMITS.pro.aiRequestsPerMonth).toBe(80);
  });

  it("uses $5.99 monthly and $49.99 annual list prices", () => {
    expect(PRO_PRICE_USD).toBe(5.99);
    expect(PRO_PRICE_ANNUAL_USD).toBe(49.99);
    expect(LIST_PRICES.proMonthlyUsd).toBe(5.99);
    expect(LIST_PRICES.proAnnualUsd).toBe(49.99);
  });

  it("builds monthly Stripe price_data in cents", () => {
    const monthly = proPriceData("month");
    expect(monthly.unit_amount).toBe(599);
    expect(monthly.recurring?.interval).toBe("month");
  });

  it("builds annual Stripe price_data in cents", () => {
    const annual = proPriceData("year");
    expect(annual.unit_amount).toBe(4999);
    expect(annual.recurring?.interval).toBe("year");
  });

  it("blocks Free generate and allows Pro generate", () => {
    expect(gateFeature("generate", () => undefined).allowed).toBe(false);
    expect(
      gateFeature("generate", (name) =>
        name === "waypoint_entitlement" ? "pro" : undefined,
      ).allowed,
    ).toBe(true);
  });

  it("detects advanced Trip Wizard requests", () => {
    expect(isAdvancedRequest("optimize my day")).toBe(true);
    expect(isAdvancedRequest("what if it rains")).toBe(true);
    expect(isAdvancedRequest("hello")).toBe(false);
  });

  it("planCopy describes Free and Pro benefits", () => {
    expect(planCopy(false).title).toBe("Free");
    expect(planCopy(true).bullets.some((line) => /wizard|generation|discover/i.test(line))).toBe(
      true,
    );
  });

  it("Free cannot create after the trip cap", () => {
    expect(canCreateTrip({ plan: "free", used: FREE_TRIP_LIMIT })).toBe(false);
  });

  it("Pro required message does not hardcode the old $6.99 price", () => {
    expect(PRO_REQUIRED_MESSAGE).not.toMatch(/6\.99/);
    expect(PLAN_LIMITS.free.wishlistCollections).toBe(5);
    expect(PLAN_LIMITS.free.compareDestinations).toBe(2);
  });
});
