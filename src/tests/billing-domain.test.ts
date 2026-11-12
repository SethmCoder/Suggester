import { describe, expect, it } from "vitest";
import {
  FREE_AI_LIMIT,
  PRO_AI_LIMIT,
  PRO_PRICE_ANNUAL_USD,
  PRO_PRICE_USD,
  PRO_REQUIRED_MESSAGE,
  TRIP_PASS_PRICE_USD,
  gateFeature,
  isAdvancedRequest,
} from "@/lib/billing/entitlements";
import {
  DEMO_CARD_PLACEHOLDER,
  demoCheckoutAmount,
  demoCheckoutProductName,
} from "@/lib/billing/demo-checkout";
import { LIST_PRICES, PLAN_LIMITS, planCopy, tripPassCopy } from "@/lib/billing/limits";
import { FREE_TRIP_LIMIT, canCreateTrip } from "@/lib/billing/plans";
import {
  emailGrantedPro,
  grantSecretMatches,
  proEmailsFromEnv,
  selfProGrantEnabled,
} from "@/lib/billing/pro-grant";
import { proPriceData, tripPassPriceData } from "@/lib/billing/stripe";
import { tripPassExpiresAtFromEndDate } from "@/lib/billing/premium";

describe("billing and entitlements domain", () => {
  it("exposes Free trip and AI limits", () => {
    expect(FREE_TRIP_LIMIT).toBe(2);
    expect(FREE_AI_LIMIT).toBe(5);
    expect(PLAN_LIMITS.free.trips).toBe(2);
    expect(PLAN_LIMITS.free.aiRequestsPerMonth).toBe(5);
  });

  it("exposes Plus AI limit and unlimited trips", () => {
    expect(PRO_AI_LIMIT).toBe(80);
    expect(PLAN_LIMITS.pro.trips).toBeNull();
    expect(PLAN_LIMITS.pro.aiRequestsPerMonth).toBe(80);
  });

  it("uses $5.99 monthly, $39.99 annual, and $8.99 Trip Pass list prices", () => {
    expect(PRO_PRICE_USD).toBe(5.99);
    expect(PRO_PRICE_ANNUAL_USD).toBe(39.99);
    expect(TRIP_PASS_PRICE_USD).toBe(8.99);
    expect(LIST_PRICES.proMonthlyUsd).toBe(5.99);
    expect(LIST_PRICES.proAnnualUsd).toBe(39.99);
    expect(LIST_PRICES.tripPassUsd).toBe(8.99);
  });

  it("builds monthly Stripe price_data in cents", () => {
    const monthly = proPriceData("month");
    expect(monthly.unit_amount).toBe(599);
    expect(monthly.recurring?.interval).toBe("month");
    expect(monthly.product_data?.name).toMatch(/Plus/);
  });

  it("builds annual Stripe price_data in cents", () => {
    const annual = proPriceData("year");
    expect(annual.unit_amount).toBe(3999);
    expect(annual.recurring?.interval).toBe("year");
  });

  it("builds Trip Pass one-time price_data in cents", () => {
    const pass = tripPassPriceData();
    expect(pass.unit_amount).toBe(899);
    expect(pass.product_data?.name).toMatch(/Trip Pass/);
  });

  it("computes Trip Pass expiry from end date + grace", () => {
    expect(tripPassExpiresAtFromEndDate("2026-06-10")).toBe("2026-06-17");
  });

  it("allows Free and Plus generate within AI quota", () => {
    expect(gateFeature("generate", () => undefined).allowed).toBe(true);
    expect(
      gateFeature("generate", (name) =>
        name === "waypoint_entitlement" ? "pro" : undefined,
      ).allowed,
    ).toBe(true);
    expect(
      gateFeature("generate", (name) =>
        name === "waypoint_ai_used"
          ? String(FREE_AI_LIMIT)
          : name === "waypoint_ai_month"
            ? "2026-11"
            : undefined,
        new Date("2026-11-05T12:00:00Z"),
      ).allowed,
    ).toBe(false);
  });

  it("detects advanced Trip Wizard requests", () => {
    expect(isAdvancedRequest("optimize my day")).toBe(true);
    expect(isAdvancedRequest("what if it rains")).toBe(true);
    expect(isAdvancedRequest("hello")).toBe(false);
  });

  it("planCopy describes Free and Plus benefits", () => {
    expect(planCopy(false).title).toBe("Free");
    expect(planCopy(true).title).toBe("Plus");
    expect(tripPassCopy().title).toBe("Trip Pass");
    expect(planCopy(true).bullets.some((line) => /wizard|AI|Discover|trip/i.test(line))).toBe(
      true,
    );
  });

  it("Free cannot create after the trip cap", () => {
    expect(canCreateTrip({ plan: "free", used: FREE_TRIP_LIMIT })).toBe(false);
  });

  it("Plus required message does not hardcode the old $6.99 price", () => {
    expect(PRO_REQUIRED_MESSAGE).not.toMatch(/6\.99/);
    expect(PRO_REQUIRED_MESSAGE).toMatch(/Plus|Trip Pass/i);
    expect(PLAN_LIMITS.free.wishlistCollections).toBe(5);
    expect(PLAN_LIMITS.free.compareDestinations).toBe(2);
  });

  it("demo checkout mirrors list prices without Stripe", () => {
    expect(demoCheckoutAmount("month").dollars).toBe(LIST_PRICES.proMonthlyUsd);
    expect(demoCheckoutAmount("year").label).toBe(
      `$${LIST_PRICES.proAnnualUsd.toFixed(2)}`,
    );
    expect(demoCheckoutProductName("month")).toMatch(/Plus/);
    expect(DEMO_CARD_PLACEHOLDER).toMatch(/^4242/);
  });

  it("grants Plus to a single allowlisted email", () => {
    const raw = "Seth@Example.com, other@test.com";
    expect(proEmailsFromEnv(raw)).toEqual([
      "seth@example.com",
      "other@test.com",
    ]);
    expect(emailGrantedPro("seth@example.com", raw)).toBe(true);
    expect(emailGrantedPro("nope@example.com", raw)).toBe(false);
    expect(selfProGrantEnabled("1")).toBe(true);
    expect(grantSecretMatches("long-enough-secret", "long-enough-secret")).toBe(
      true,
    );
    expect(grantSecretMatches("wrong", "long-enough-secret")).toBe(false);
  });
});
