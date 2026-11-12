import { formatMoney, roundMoney } from "@/lib/billing/plans";
import type { BudgetAllocation } from "@/lib/trips/budget";

export const EXPENSE_CATEGORIES = [
  "souvenirs",
  "things_to_do",
  "eating",
  "transit",
  "hotel",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Stored split: either share of budget (0–100) or currency amounts that sum to trip total. */
export type ExpenseCategorySplit = {
  mode: "percent" | "amount";
  values: Record<ExpenseCategory, number>;
};

const LEGACY_CATEGORY_MAP: Record<string, ExpenseCategory> = {
  tickets: "things_to_do",
  activities: "things_to_do",
  food: "eating",
  other: "souvenirs",
  souvenirs: "souvenirs",
  things_to_do: "things_to_do",
  eating: "eating",
  transit: "transit",
  hotel: "hotel",
};

export function migrateExpenseCategory(raw: unknown): ExpenseCategory | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = raw.trim().toLowerCase();
  if (EXPENSE_CATEGORIES.includes(key as ExpenseCategory)) {
    return key as ExpenseCategory;
  }
  return LEGACY_CATEGORY_MAP[key] ?? null;
}

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

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  souvenirs: "Souvenirs",
  things_to_do: "Things to do",
  eating: "Eating",
  transit: "Transit",
  hotel: "Hotel",
};

export function categoryLabel(category: ExpenseCategory): string {
  return CATEGORY_LABELS[category];
}

/** Tailwind-friendly hex accents for category bars. */
export function categoryAccent(category: ExpenseCategory): string {
  if (category === "souvenirs") return "#D97706";
  if (category === "things_to_do") return "#0400FF";
  if (category === "eating") return "#EA580C";
  if (category === "transit") return "#0D9488";
  return "#7C3AED";
}

export function emptyCategoryRecord(value = 0): Record<ExpenseCategory, number> {
  return {
    souvenirs: value,
    things_to_do: value,
    eating: value,
    transit: value,
    hotel: value,
  };
}

/** Default planned split from the trip’s coarse budget allocation question. */
export function defaultCategorySplit(
  allocation?: BudgetAllocation,
): ExpenseCategorySplit {
  const values = emptyCategoryRecord(20);
  if (allocation === "sights") {
    values.things_to_do = 45;
    values.eating = 20;
    values.transit = 15;
    values.hotel = 15;
    values.souvenirs = 5;
  } else if (allocation === "food") {
    values.eating = 45;
    values.things_to_do = 20;
    values.transit = 15;
    values.hotel = 15;
    values.souvenirs = 5;
  } else if (allocation === "getting-around") {
    values.transit = 40;
    values.things_to_do = 25;
    values.eating = 20;
    values.hotel = 10;
    values.souvenirs = 5;
  } else if (allocation === "mostly-free") {
    values.transit = 30;
    values.eating = 30;
    values.things_to_do = 20;
    values.souvenirs = 15;
    values.hotel = 5;
  }
  return { mode: "percent", values };
}

export function normalizeCategorySplit(
  raw: unknown,
  allocation?: BudgetAllocation,
): ExpenseCategorySplit {
  const fallback = defaultCategorySplit(allocation);
  if (!raw || typeof raw !== "object") return fallback;
  const row = raw as Record<string, unknown>;
  const mode = row.mode === "amount" ? "amount" : "percent";
  const valuesRaw = row.values;
  if (!valuesRaw || typeof valuesRaw !== "object") {
    return { mode, values: fallback.values };
  }
  const src = valuesRaw as Record<string, unknown>;
  const values = emptyCategoryRecord(0);
  for (const key of EXPENSE_CATEGORIES) {
    const n = Number(src[key]);
    values[key] = Number.isFinite(n) && n >= 0 ? n : fallback.values[key];
  }
  if (mode === "percent") {
    const sum = EXPENSE_CATEGORIES.reduce((s, k) => s + values[k], 0);
    if (sum > 0 && Math.abs(sum - 100) > 0.5) {
      for (const key of EXPENSE_CATEGORIES) {
        values[key] = roundMoney((values[key] / sum) * 100, "USD");
      }
    }
  }
  return { mode, values };
}

export function plannedByCategory(
  split: ExpenseCategorySplit,
  total: number,
  tripCurrency = "USD",
): Record<ExpenseCategory, number> {
  const out = emptyCategoryRecord(0);
  if (!(total > 0)) return out;
  if (split.mode === "amount") {
    for (const key of EXPENSE_CATEGORIES) {
      out[key] = roundMoney(split.values[key], tripCurrency);
    }
    return out;
  }
  for (const key of EXPENSE_CATEGORIES) {
    out[key] = roundMoney((total * split.values[key]) / 100, tripCurrency);
  }
  return out;
}

export function adjustCategorySplit(
  split: ExpenseCategorySplit,
  key: ExpenseCategory,
  nextValue: number,
  budgetTotal: number,
): ExpenseCategorySplit {
  const clamped = Math.max(0, nextValue);
  const others = EXPENSE_CATEGORIES.filter((k) => k !== key);
  const otherSum = others.reduce((sum, k) => sum + split.values[k], 0);
  const targetSum = split.mode === "percent" ? 100 : Math.max(0, budgetTotal);
  const remaining = Math.max(0, targetSum - clamped);
  const values = { ...split.values, [key]: clamped };
  if (otherSum <= 0) {
    const each = others.length ? remaining / others.length : 0;
    for (const k of others) values[k] = each;
    return { ...split, values };
  }
  const scale = remaining / otherSum;
  for (const k of others) {
    values[k] =
      split.mode === "percent"
        ? Math.round(values[k] * scale * 10) / 10
        : roundMoney(values[k] * scale, "USD");
  }
  return { ...split, values };
}

export function splitSumValid(
  split: ExpenseCategorySplit,
  budgetTotal: number,
): boolean {
  const sum = EXPENSE_CATEGORIES.reduce((s, k) => s + split.values[k], 0);
  if (split.mode === "percent") return Math.abs(sum - 100) < 1;
  if (!(budgetTotal > 0)) return true;
  return Math.abs(sum - budgetTotal) < 0.02;
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
  const category = migrateExpenseCategory(row.category);
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
  const out = emptyCategoryRecord(0);
  for (const item of expenses) {
    out[item.category] = roundMoney(
      out[item.category] + item.amountInTripCurrency,
      tripCurrency,
    );
  }
  return out;
}
