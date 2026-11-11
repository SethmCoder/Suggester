"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  allocationLabel,
  restaurantLabel,
  type BudgetPlan,
} from "@/lib/trips/budget";
import {
  EXPENSE_CATEGORIES,
  budgetProgress,
  categoryLabel,
  createExpenseId,
  type ExpenseCategory,
  type TripExpense,
} from "@/lib/trips/expenses";
import { formatMoney } from "@/lib/billing/plans";

function costLabel(note?: string | null): string {
  if (/lists this as free/i.test(note ?? "")) return "Listed as free";
  if (/a fee is listed/i.test(note ?? "")) return "Fee listed, amount not listed";
  return "Cost not listed";
}

const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "MXN",
  "KRW",
  "SGD",
  "THB",
  "AED",
];

export function BudgetPanel({
  plan,
  stops,
  expenses,
  onExpensesChange,
}: {
  plan?: BudgetPlan;
  stops: { id: string; name: string; note?: string | null }[];
  expenses: TripExpense[];
  onExpensesChange: (next: TripExpense[]) => void;
}) {
  const tripCurrency = (plan?.currency || "USD").toUpperCase();
  const progress = useMemo(
    () => budgetProgress(expenses, plan?.total, tripCurrency),
    [expenses, plan?.total, tripCurrency],
  );
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(tripCurrency);
  const [category, setCategory] = useState<ExpenseCategory>("tickets");
  const [note, setNote] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrency(tripCurrency);
  }, [tripCurrency]);

  let total = "Not set";
  if (plan?.total && plan.total > 0) {
    total = progress.totalLabel ?? total;
  }

  async function addExpense() {
    const parsedAmount = Number(amount);
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Add a short label for this purchase.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const from = currency.trim().toUpperCase() || tripCurrency;
      let amountInTripCurrency = parsedAmount;
      let fxRate = 1;
      if (from !== tripCurrency) {
        const res = await fetch("/api/fx/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parsedAmount,
            from,
            to: tripCurrency,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Could not convert currency");
        }
        amountInTripCurrency = Number(data.converted);
        fxRate = Number(data.rate) || amountInTripCurrency / Math.max(parsedAmount, 1);
      }
      const next: TripExpense = {
        id: createExpenseId(),
        label: trimmed.slice(0, 120),
        category,
        amount: parsedAmount,
        currency: from,
        amountInTripCurrency,
        fxRate,
        note: note.trim() ? note.trim().slice(0, 400) : undefined,
        purchasedAt: purchasedAt || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      };
      onExpensesChange([next, ...expenses]);
      setLabel("");
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add expense");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[16px] border border-[#E1E5F0] bg-white px-5 py-4 shadow-[0_6px_18px_rgba(8,11,58,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#080B3A]">Budget</h2>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Log purchases against your trip total. Other currencies convert automatically.
          </p>
        </div>
        {progress.percentUsed != null ? (
          <p
            className={`rounded-[10px] px-2.5 py-1 text-xs font-semibold ${
              progress.overBudget
                ? "bg-[#FEE2E2] text-[#B91C1C]"
                : "bg-[#EEF2FF] text-[#0400FF]"
            }`}
          >
            {progress.percentUsed}% used
          </p>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-2 text-sm text-[#1F2937] sm:grid-cols-3">
        <div>
          <dt className="text-[#6B7280]">Whole trip</dt>
          <dd className="font-medium">{total}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Spent</dt>
          <dd className="font-medium">{progress.spentLabel}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Remaining</dt>
          <dd
            className={`font-medium ${
              progress.overBudget ? "text-[#B91C1C]" : ""
            }`}
          >
            {progress.remainingLabel ?? "Set a trip total to track remaining"}
          </dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Use it for</dt>
          <dd className="font-medium">{allocationLabel(plan?.allocation)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Restaurants</dt>
          <dd className="font-medium">{restaurantLabel(plan?.restaurantStyle)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Party</dt>
          <dd className="font-medium capitalize">{plan?.party || "Not set"}</dd>
        </div>
      </dl>

      {plan?.total && plan.total > 0 ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8ECF6]">
          <div
            className={`h-full rounded-full ${
              progress.overBudget ? "bg-[#DC2626]" : "bg-[#0400FF]"
            }`}
            style={{
              width: `${Math.min(100, progress.percentUsed ?? 0)}%`,
            }}
          />
        </div>
      ) : null}

      <div className="mt-4 rounded-[14px] border border-[#D1D7E5] bg-[#F8F9FC] p-3">
        <p className="text-sm font-semibold text-[#080B3A]">Log a purchase</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="expense-label">What</Label>
            <Input
              id="expense-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Museum tickets, metro day pass…"
            />
          </div>
          <div>
            <Label htmlFor="expense-category">Category</Label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="mt-1 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm text-[#080B3A]"
            >
              {EXPENSE_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="expense-amount">Amount</Label>
            <Input
              id="expense-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="24.50"
            />
          </div>
          <div>
            <Label htmlFor="expense-currency">Currency</Label>
            <select
              id="expense-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm text-[#080B3A]"
            >
              {[...new Set([tripCurrency, ...COMMON_CURRENCIES])].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="expense-date">Date</Label>
            <Input
              id="expense-date"
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="expense-note">Note</Label>
            <Input
              id="expense-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        {currency !== tripCurrency ? (
          <p className="mt-2 text-xs text-[#6B7280]">
            Will convert to {tripCurrency} using today’s reference rate when you
            add it.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-[#DC2626]">{error}</p> : null}
        <div className="mt-3">
          <Button type="button" disabled={busy} onClick={() => void addExpense()}>
            {busy ? "Converting…" : "Add purchase"}
          </Button>
        </div>
      </div>

      {expenses.length ? (
        <ul className="mt-4 divide-y divide-[#E8ECF6]">
          {expenses.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-[#080B3A]">{item.label}</p>
                <p className="text-xs text-[#6B7280]">
                  {categoryLabel(item.category)} · {item.purchasedAt}
                  {item.note ? ` · ${item.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-semibold text-[#080B3A]">
                    {formatMoney(item.amountInTripCurrency, tripCurrency)}
                  </p>
                  {item.currency !== tripCurrency ? (
                    <p className="text-xs text-[#6B7280]">
                      {formatMoney(item.amount, item.currency)}
                      {item.fxRate
                        ? ` · rate ${item.fxRate.toFixed(4)}`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#DC2626] hover:underline"
                  onClick={() =>
                    onExpensesChange(expenses.filter((row) => row.id !== item.id))
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#6B7280]">
          No purchases logged yet. Add tickets, meals, transit, or hotels as you
          buy them.
        </p>
      )}

      {stops.length ? (
        <div className="mt-4 border-t border-[#E8ECF6] pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Today’s stops (listed costs)
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[#374151]">
            {stops.map((stop) => (
              <li key={stop.id} className="flex justify-between gap-3">
                <span className="truncate">{stop.name}</span>
                <span className="shrink-0 text-[#6B7280]">
                  {costLabel(stop.note)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[#6B7280]">
            Place listings rarely include exact ticket prices — log the real
            purchase above when you buy it.
          </p>
        </div>
      ) : null}
    </section>
  );
}
