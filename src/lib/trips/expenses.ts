import { formatMoney, roundMoney } from "@/lib/billing/plans";

export const EXPENSE_CATEGORIES = [
  "tickets",
  "food",
  "transit",
  "hotel",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type TripExpense = {
  id: string;
  label: string;
  category: ExpenseCategory;
  /** Amount the traveler paid, in `currency`. */
  amount: number;
  currency: string;
  /** Same spend converted into the trip budget currency. */
  amountInTripCurrency: number;
  fxRate?: number;
  note?: string;
  /** Purchase date (YYYY-MM-DD). */
  purchasedAt: string;
  createdAt: string;
};

export type ExpenseTotals = {
  spent: number;
  remaining: number | null;
  overBudget: boolean;
  percentUsed: number | null;
};

export function categoryLabel(category: ExpenseCategory): string {
  if (category === "tickets") return "Tickets";
  if (category === "food") return "Food";
  if (category === "transit") return "Transit";
  if (category === "hotel") return "Hotel";
  return "Other";
}

export function createExpenseId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `exp-${crypto.randomUUID()}`;
  }
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeExpense(raw: unknown): TripExpense | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const category = EXPENSE_CATEGORIES.includes(row.category as ExpenseCategory)
    ? (row.category as ExpenseCategory)
    : null;
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
  const amountInTripCurrency =
    typeof row.amountInTripCurrency === "number"
      ? row.amountInTripCurrency
      : Number(row.amountInTripCurrency);
  const currency =
    typeof row.currency === "string" && row.currency.trim()
      ? row.currency.trim().toUpperCase()
      : "";
  const label =
    typeof row.label === "string" && row.label.trim() ? row.label.trim() : "";
  const id =
    typeof row.id === "string" && row.id.trim()
      ? row.id.trim()
      : createExpenseId();
  if (!category || !label || !currency) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (!Number.isFinite(amountInTripCurrency) || amountInTripCurrency < 0) {
    return null;
  }
  return {
    id,
    label: label.slice(0, 120),
    category,
    amount,
    currency,
    amountInTripCurrency,
    fxRate:
      typeof row.fxRate === "number" && Number.isFinite(row.fxRate)
        ? row.fxRate
        : undefined,
    note:
      typeof row.note === "string" && row.note.trim()
        ? row.note.trim().slice(0, 400)
        : undefined,
    purchasedAt:
      typeof row.purchasedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(row.purchasedAt)
        ? row.purchasedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    createdAt:
      typeof row.createdAt === "string" && row.createdAt
        ? row.createdAt
        : new Date().toISOString(),
  };
}

export function normalizeExpenses(raw: unknown): TripExpense[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeExpense)
    .filter((item): item is TripExpense => Boolean(item));
}

export function sumExpenses(
  expenses: TripExpense[],
  tripCurrency = "USD",
): ExpenseTotals & { spentLabel: string; remainingLabel: string | null } {
  const spent = roundMoney(
    expenses.reduce((sum, item) => sum + (item.amountInTripCurrency || 0), 0),
    tripCurrency,
  );
  return {
    spent,
    remaining: null,
    overBudget: false,
    percentUsed: null,
    spentLabel: formatMoney(spent, tripCurrency),
    remainingLabel: null,
  };
}

export function budgetProgress(
  expenses: TripExpense[],
  total: number | undefined,
  tripCurrency = "USD",
): ExpenseTotals & { spentLabel: string; remainingLabel: string | null; totalLabel: string | null } {
  const base = sumExpenses(expenses, tripCurrency);
  if (!total || !(total > 0)) {
    return { ...base, totalLabel: null };
  }
  const remaining = roundMoney(total - base.spent, tripCurrency);
  const percentUsed = Math.min(999, Math.round((base.spent / total) * 100));
  return {
    spent: base.spent,
    remaining,
    overBudget: remaining < 0,
    percentUsed,
    spentLabel: base.spentLabel,
    remainingLabel: formatMoney(remaining, tripCurrency),
    totalLabel: formatMoney(total, tripCurrency),
  };
}

export function spentByCategory(
  expenses: TripExpense[],
  tripCurrency = "USD",
): Record<ExpenseCategory, number> {
  const out: Record<ExpenseCategory, number> = {
    tickets: 0,
    food: 0,
    transit: 0,
    hotel: 0,
    other: 0,
  };
  for (const item of expenses) {
    out[item.category] = roundMoney(
      out[item.category] + item.amountInTripCurrency,
      tripCurrency,
    );
  }
  return out;
}
