import { describe, expect, it } from "vitest";
import {
  canCreateTrip,
  currencyForCountry,
  formatMoney,
  readPlan,
  roundMoney,
  PLAN_COOKIE,
  USED_COOKIE,
} from "@/lib/billing/plans";

describe("free and pro plans", () => {
  it("lets free create until the third trip", () => {
    expect(canCreateTrip({ plan: "free", used: 2 })).toBe(true);
    expect(canCreateTrip({ plan: "free", used: 3 })).toBe(false);
    expect(canCreateTrip({ plan: "pro", used: 40 })).toBe(true);
  });

  it("reads the plan cookies", () => {
    const free = readPlan((name) => (name === USED_COOKIE ? "2" : undefined));
    expect(free).toMatchObject({ plan: "free", used: 2, limit: 3, remaining: 1 });
    const pro = readPlan((name) => (name === PLAN_COOKIE ? "pro" : "9"));
    expect(pro.plan).toBe("pro");
    expect(pro.limit).toBeNull();
    expect(pro.remaining).toBeNull();
  });
});

describe("pro price currency", () => {
  it("maps a country to a currency", () => {
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("fr")).toBe("EUR");
    expect(currencyForCountry("JP")).toBe("JPY");
    expect(currencyForCountry("")).toBe("EUR");
    expect(currencyForCountry("ZZ")).toBe("EUR");
  });

  it("rounds and formats a converted price", () => {
    expect(roundMoney(9 * 1.1224, "USD")).toBe(10.1);
    expect(roundMoney(9 * 170, "JPY")).toBe(1530);
    expect(formatMoney(10.1, "USD", "en-US")).toMatch(/10\.10/);
  });
});
