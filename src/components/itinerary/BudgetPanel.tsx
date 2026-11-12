"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  allocationLabel,
  restaurantLabel,
  type BudgetPlan,
} from "@/lib/trips/budget";
import {
  EXPENSE_CATEGORIES,
  adjustCategorySplit,
  budgetProgress,
  categoryAccent,
  categoryLabel,
  createExpenseId,
  plannedByCategory,
  spentByCategory,
  splitSumValid,
  type ExpenseCategory,
  type ExpenseCategorySplit,
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
  tripId,
  plan,
  stops,
  expenses,
  categorySplit,
  onExpensesChange,
  onCategorySplitChange,
  onPlanChange,
  isDemo = false,
}: {
  tripId: string;
  plan?: BudgetPlan;
  stops: { id: string; name: string; note?: string | null }[];
  expenses: TripExpense[];
  categorySplit: ExpenseCategorySplit;
  onExpensesChange: (next: TripExpense[]) => void;
  onCategorySplitChange: (next: ExpenseCategorySplit) => void;
  onPlanChange?: (next: BudgetPlan) => void;
  isDemo?: boolean;
}) {
  const tripCurrency = (plan?.currency || "USD").toUpperCase();
  const budgetTotal = plan?.total && plan.total > 0 ? plan.total : 0;
  const [budgetDraft, setBudgetDraft] = useState(
    plan?.total && plan.total > 0 ? String(plan.total) : "",
  );
  useEffect(() => {
    setBudgetDraft(plan?.total && plan.total > 0 ? String(plan.total) : "");
  }, [plan?.total]);
  const progress = useMemo(
    () => budgetProgress(expenses, plan?.total, tripCurrency),
    [expenses, plan?.total, tripCurrency],
  );
  const byCategory = useMemo(
    () => spentByCategory(expenses, tripCurrency),
    [expenses, tripCurrency],
  );
  const planned = useMemo(
    () => plannedByCategory(categorySplit, budgetTotal, tripCurrency),
    [categorySplit, budgetTotal, tripCurrency],
  );

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(tripCurrency);
  const [category, setCategory] = useState<ExpenseCategory>("things_to_do");
  const [note, setNote] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [receiptText, setReceiptText] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const screenshotRef = useRef<HTMLInputElement>(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);

  const [editSplit, setEditSplit] = useState(false);

  useEffect(() => {
    setCurrency(tripCurrency);
  }, [tripCurrency]);

  const commitExpense = useCallback(
    async (draft: {
      label: string;
      amount: number;
      currency: string;
      category: ExpenseCategory;
      note?: string;
      purchasedAt: string;
    }) => {
      setBusy(true);
      setError(null);
      try {
        const from = draft.currency.trim().toUpperCase() || tripCurrency;
        let amountInTripCurrency = draft.amount;
        let fxRate = 1;
        if (from !== tripCurrency) {
          const res = await fetch("/api/fx/convert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: draft.amount,
              from,
              to: tripCurrency,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error ?? "Could not convert currency");
          }
          amountInTripCurrency = Number(data.converted);
          fxRate =
            Number(data.rate) || amountInTripCurrency / Math.max(draft.amount, 1);
        }
        const next: TripExpense = {
          id: createExpenseId(),
          label: draft.label.slice(0, 120),
          category: draft.category,
          amount: draft.amount,
          currency: from,
          amountInTripCurrency,
          fxRate,
          note: draft.note,
          purchasedAt: draft.purchasedAt,
          createdAt: new Date().toISOString(),
        };
        onExpensesChange([next, ...expenses]);
        setLabel("");
        setAmount("");
        setNote("");
        setReceiptText("");
        setScreenshotDataUrl(null);
        if (screenshotRef.current) screenshotRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add expense");
      } finally {
        setBusy(false);
      }
    },
    [expenses, onExpensesChange, tripCurrency],
  );

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
    await commitExpense({
      label: trimmed,
      amount: parsedAmount,
      currency: currency.trim().toUpperCase() || tripCurrency,
      category,
      note: note.trim() ? note.trim().slice(0, 400) : undefined,
      purchasedAt: purchasedAt || new Date().toISOString().slice(0, 10),
    });
  }

  async function parseReceipt() {
    if (isDemo || tripId.startsWith("offline-")) {
      setReceiptError("Receipt parsing needs a saved cloud trip.");
      return;
    }
    if (!receiptText.trim() && !screenshotDataUrl) {
      setReceiptError("Paste receipt text or attach a screenshot.");
      return;
    }
    setReceiptBusy(true);
    setReceiptError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: receiptText.trim() || undefined,
          screenshotDataUrl: screenshotDataUrl ?? undefined,
          tripCurrency,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Could not parse receipt");
      }
      setLabel(String(data.label ?? ""));
      setAmount(String(data.amount ?? ""));
      if (data.currency) setCurrency(String(data.currency).toUpperCase());
      if (data.category) setCategory(data.category as ExpenseCategory);
      if (data.note) setNote(String(data.note));
      if (data.purchasedAt) setPurchasedAt(String(data.purchasedAt).slice(0, 10));
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setReceiptBusy(false);
    }
  }

  function onScreenshotPick(file: File | undefined) {
    if (!file) {
      setScreenshotDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      setScreenshotDataUrl(url);
    };
    reader.readAsDataURL(file);
  }

  function toggleSplitMode() {
    const nextMode = categorySplit.mode === "percent" ? "amount" : "percent";
    if (nextMode === "amount" && budgetTotal > 0) {
      onCategorySplitChange({
        mode: "amount",
        values: planned,
      });
    } else {
      const values = { ...categorySplit.values };
      if (budgetTotal > 0) {
        for (const key of EXPENSE_CATEGORIES) {
          values[key] = Math.round((planned[key] / budgetTotal) * 1000) / 10;
        }
      }
      onCategorySplitChange({ mode: "percent", values });
    }
  }

  let total = "Not set";
  if (plan?.total && plan.total > 0) {
    total = progress.totalLabel ?? total;
  }

  const splitValid = splitSumValid(categorySplit, budgetTotal);

  return (
    <section
      id="budget"
      className="scroll-mt-24 rounded-[16px] border border-[#E1E5F0] bg-white px-5 py-4 shadow-[0_6px_18px_rgba(8,11,58,0.05)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#080B3A]">Budget</h2>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Split the trip budget by category, log purchases, and paste receipts for
            quick entry.
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
          <dd className="font-medium">
            {onPlanChange ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Input
                  inputMode="decimal"
                  className="h-9 w-28"
                  placeholder="2500"
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  onBlur={() => {
                    const n = Number(budgetDraft);
                    if (!Number.isFinite(n) || n < 0) return;
                    onPlanChange({
                      ...plan,
                      total: n > 0 ? Math.round(n) : undefined,
                      currency: tripCurrency,
                    });
                  }}
                />
                <select
                  className="h-9 rounded-[10px] border border-[#E1E5F0] bg-white px-2 text-sm"
                  value={tripCurrency}
                  onChange={(e) => {
                    const nextCurrency = e.target.value.toUpperCase();
                    onPlanChange({
                      ...plan,
                      total: budgetTotal > 0 ? budgetTotal : undefined,
                      currency: nextCurrency,
                    });
                  }}
                >
                  {COMMON_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              total
            )}
          </dd>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
          Category plan vs spend
        </p>
        {budgetTotal > 0 ? (
          <EditSplitControls
            editSplit={editSplit}
            setEditSplit={setEditSplit}
            mode={categorySplit.mode}
            onToggleMode={toggleSplitMode}
            splitValid={splitValid}
          />
        ) : null}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-5">
        {EXPENSE_CATEGORIES.map((key) => {
          const accent = categoryAccent(key);
          const planAmount = planned[key];
          const spent = byCategory[key];
          const fillPct =
            planAmount > 0 ? Math.min(100, (spent / planAmount) * 100) : spent > 0 ? 100 : 0;
          return (
            <div
              key={key}
              className="rounded-[12px] border border-[#E8ECF6] bg-[#FAFBFF] px-3 py-2"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B7280]">
                {categoryLabel(key)}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#080B3A]">
                {formatMoney(spent, tripCurrency)}
                {budgetTotal > 0 ? (
                  <span className="ml-1 text-xs font-normal text-[#6B7280]">
                    / {formatMoney(planAmount, tripCurrency)}
                  </span>
                ) : null}
              </p>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full"
                style={{ backgroundColor: `${accent}22` }}
              >
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${fillPct}%`,
                    backgroundColor: accent,
                    opacity: 0.85,
                  }}
                />
              </div>
              {editSplit && budgetTotal > 0 ? (
                <div className="mt-2 flex items-center gap-1">
                  <Input
                    inputMode="decimal"
                    className="h-8 text-xs"
                    value={String(categorySplit.values[key])}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      onCategorySplitChange(
                        adjustCategorySplit(categorySplit, key, n, budgetTotal),
                      );
                    }}
                  />
                  <span className="text-[10px] text-[#6B7280]">
                    {categorySplit.mode === "percent" ? "%" : tripCurrency}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-[14px] border border-[#D1D7E5] bg-[#F8F9FC] p-3">
        <p className="text-sm font-semibold text-[#080B3A]">From a receipt</p>
        <p className="mt-0.5 text-xs text-[#6B7280]">
          Paste card notification text or attach a photo — fields below fill in for
          you to review.
        </p>
        <textarea
          className="mt-2 min-h-[72px] w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm text-[#080B3A]"
          value={receiptText}
          onChange={(e) => setReceiptText(e.target.value)}
          placeholder="Merchant, amount, date…"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={screenshotRef}
            type="file"
            accept="image/*"
            className="text-xs text-[#6B7280]"
            onChange={(e) => onScreenshotPick(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={receiptBusy}
            onClick={() => void parseReceipt()}
          >
            {receiptBusy ? "Reading…" : "Parse receipt"}
          </Button>
        </div>
        {receiptError ? (
          <p className="mt-2 text-sm text-[#DC2626]">{receiptError}</p>
        ) : null}
      </div>

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
            Will convert to {tripCurrency} using today’s reference rate when you add
            it.
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
                      {item.fxRate ? ` · rate ${item.fxRate.toFixed(4)}` : ""}
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
          No purchases logged yet. Add things to do, meals, transit, hotels, or
          souvenirs as you buy them.
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
                <span className="shrink-0 text-[#6B7280]">{costLabel(stop.note)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[#6B7280]">
            Place listings rarely include exact ticket prices — log the real purchase
            above when you buy it.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function EditSplitControls({
  editSplit,
  setEditSplit,
  mode,
  onToggleMode,
  splitValid,
}: {
  editSplit: boolean;
  setEditSplit: (v: boolean) => void;
  mode: "percent" | "amount";
  onToggleMode: () => void;
  splitValid: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="text-xs font-semibold text-[#0400FF] hover:underline"
        onClick={() => setEditSplit(!editSplit)}
      >
        {editSplit ? "Done" : "Edit split"}
      </button>
      {editSplit ? (
        <button
          type="button"
          className="text-xs font-semibold text-[#6B7280] hover:underline"
          onClick={onToggleMode}
        >
          Use {mode === "percent" ? "amounts" : "percentages"}
        </button>
      ) : null}
      {editSplit && !splitValid ? (
        <span className="text-xs text-[#B45309]">
          {mode === "percent" ? "Should sum to 100%" : "Should sum to trip total"}
        </span>
      ) : null}
    </div>
  );
}
