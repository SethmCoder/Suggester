import { describe, expect, it } from "vitest";
import {
  budgetProgress,
  migrateExpenseCategory,
  normalizeExpense,
  normalizeExpenses,
  spentByCategory,
  sumExpenses,
} from "@/lib/trips/expenses";
import { convertCurrency } from "@/lib/trips/fx";

describe("trip expenses", () => {
  it("maps legacy categories when normalizing", () => {
    const row = normalizeExpense({
      id: "1",
      label: "Louvre",
      category: "tickets",
      amount: 22,
      currency: "EUR",
      amountInTripCurrency: 24,
      purchasedAt: "2026-07-01",
      createdAt: "2026-07-01T12:00:00.000Z",
    });
    expect(row?.category).toBe("things_to_do");
    expect(migrateExpenseCategory("food")).toBe("eating");
    expect(migrateExpenseCategory("other")).toBe("souvenirs");
  });

  it("sums spend in the trip currency and tracks remaining budget", () => {
    const expenses = normalizeExpenses([
      {
        id: "1",
        label: "Louvre",
        category: "things_to_do",
        amount: 22,
        currency: "EUR",
        amountInTripCurrency: 24,
        purchasedAt: "2026-07-01",
        createdAt: "2026-07-01T12:00:00.000Z",
      },
      {
        id: "2",
        label: "Café",
        category: "eating",
        amount: 18,
        currency: "USD",
        amountInTripCurrency: 18,
        purchasedAt: "2026-07-01",
        createdAt: "2026-07-01T13:00:00.000Z",
      },
    ]);
    expect(sumExpenses(expenses, "USD").spent).toBe(42);
    const progress = budgetProgress(expenses, 100, "USD");
    expect(progress.remaining).toBe(58);
    expect(progress.percentUsed).toBe(42);
    expect(progress.overBudget).toBe(false);
    expect(spentByCategory(expenses, "USD").things_to_do).toBe(24);
    expect(spentByCategory(expenses, "USD").eating).toBe(18);
  });

  it("marks over-budget when spend exceeds the ceiling", () => {
    const expenses = normalizeExpenses([
      {
        id: "1",
        label: "Hotel",
        category: "hotel",
        amount: 400,
        currency: "USD",
        amountInTripCurrency: 400,
        purchasedAt: "2026-07-01",
        createdAt: "2026-07-01T12:00:00.000Z",
      },
    ]);
    const progress = budgetProgress(expenses, 250, "USD");
    expect(progress.overBudget).toBe(true);
    expect(progress.remaining).toBe(-150);
  });
});

describe("FX convert", () => {
  it("returns identity conversion for the same currency", async () => {
    const result = await convertCurrency({
      amount: 12.5,
      from: "usd",
      to: "USD",
    });
    expect(result.converted).toBe(12.5);
    expect(result.rate).toBe(1);
  });

  it("converts via Frankfurter when currencies differ", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          amount: 10,
          base: "USD",
          date: "2026-07-01",
          rates: { EUR: 9.2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const result = await convertCurrency({
      amount: 10,
      from: "USD",
      to: "EUR",
      fetchImpl,
    });
    expect(result.converted).toBe(9.2);
    expect(result.rate).toBeCloseTo(0.92);
  });
});
