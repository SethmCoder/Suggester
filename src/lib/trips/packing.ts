export type PackingItem = {
  id: string;
  label: string;
  checked: boolean;
  auto?: boolean;
};

export function seedPackingList(input: {
  party?: string | null;
  durationDays?: number | null;
  wetWeather?: boolean;
}): PackingItem[] {
  const days = Math.max(1, input.durationDays ?? 3);
  const base = [
    "Passport / ID",
    "Phone charger",
    "Medications",
    "Toothbrush",
    `${days} days of clothes`,
    "Comfortable walking shoes",
  ];
  if (input.wetWeather) base.push("Rain jacket", "Compact umbrella");
  else base.push("Light layer / sweater");
  if (/family|multigen|kid/i.test(input.party || "")) {
    base.push("Kids snacks", "Stroller / carrier if needed");
  }
  if (/business/i.test(input.party || "")) {
    base.push("Work outfit", "Laptop + charger");
  }
  return base.map((label, i) => ({
    id: `pack-auto-${i}`,
    label,
    checked: false,
    auto: true,
  }));
}

export function normalizePacking(raw: unknown): PackingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row, i) => ({
      id: typeof row.id === "string" ? row.id : `pack-${i}`,
      label: typeof row.label === "string" ? row.label : "Item",
      checked: Boolean(row.checked),
      auto: Boolean(row.auto),
    }))
    .filter((row) => row.label.trim().length > 0);
}
