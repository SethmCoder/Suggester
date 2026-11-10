import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import type { DreamerSuggestion } from "./types";

function findCatalog(destination: string) {
  const n = destination.toLowerCase();
  return DESTINATION_CATALOG.find(
    (d) =>
      n.includes(d.name.toLowerCase()) ||
      d.name.toLowerCase().includes(n.split(",")[0]?.trim() ?? n),
  );
}

/**
 * Grounded suggestion feed — catalog seasons + similarTo only.
 * Never invents event dates or festivals. Detours are reviewable.
 */
export function buildDreamerSuggestions(input: {
  destination: string;
  month?: number | null;
  stayDays?: number | null;
  forecastNote?: string | null;
  /** Only emit climate/detour tips after concrete booking evidence. */
  hasEvidence?: boolean;
}): DreamerSuggestion[] {
  if (!input.hasEvidence) return [];

  const out: DreamerSuggestion[] = [];
  const dest = findCatalog(input.destination);
  const month = input.month ?? null;

  if (dest && month) {
    const warm = dest.warmMonths.includes(month);
    out.push({
      id: "climate-home",
      kind: "climate",
      title: `${dest.name} in this season`,
      body: warm
        ? `${dest.name} tends to be warmer in month ${month} (catalog seasonal note). ${input.forecastNote ?? ""}`.trim()
        : `${dest.name} tends to be cooler in month ${month} (catalog seasonal note). ${input.forecastNote ?? ""}`.trim(),
      confidence: input.forecastNote ? "forecast" : "catalog",
    });

    if (warm && dest.similarTo?.length) {
      const cooler = dest.similarTo
        .map((id) => DESTINATION_CATALOG.find((d) => d.id === id))
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .filter((d) => !d.warmMonths.includes(month))
        .slice(0, 2);
      for (const c of cooler) {
        out.push({
          id: `detour-${c.id}`,
          kind: "detour",
          title: `Cooler detour: ${c.name}`,
          body: `You planned ${dest.name} around month ${month}; it is typically warm then. A cooler catalog neighbor is ${c.name}. This extra stop would usually merit rail or a short flight.`,
          confidence: "estimate",
          transportMethod: "rail or short flight",
          costEstimateLabel:
            "Cost omitted — no live fare source; review before adding.",
          reviewStatus: "pending",
        });
      }
    }
  }

  if (dest && input.stayDays != null) {
    const { min, max } = dest.durationDays;
    if (input.stayDays < min) {
      out.push({
        id: "stay-short",
        kind: "stay",
        title: "Stay length (catalog)",
        body: `You have ${input.stayDays} days of booking evidence. Catalog guidance for ${dest.name} is usually ${min}–${max} days — soft guidance only, not a dated event.`,
        confidence: "catalog",
      });
    } else if (input.stayDays > max) {
      out.push({
        id: "stay-long",
        kind: "stay",
        title: "Stay length (catalog)",
        body: `${input.stayDays} days is on the long side versus the catalog range of ${min}–${max} for ${dest.name}.`,
        confidence: "catalog",
      });
    }
  }

  if (dest?.attractions?.length) {
    out.push({
      id: "nearby-catalog",
      kind: "nearby",
      title: "Worth checking around your dates",
      body: `Catalog places travelers often consider in ${dest.name}: ${dest.attractions.slice(0, 3).join(", ")}. Confirm hours and tickets locally — no event dates invented here.`,
      confidence: "catalog",
    });
  }

  return out;
}

export function materializeDatesFromBooking(input: {
  flightDate: string;
  stayDays: number;
}): { startDate: string; endDate: string; nights: number } {
  const stayDays = Math.max(1, input.stayDays);
  const start = new Date(`${input.flightDate}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(0, stayDays - 1));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  return {
    startDate,
    endDate,
    nights: Math.max(0, stayDays - 1),
  };
}

/** Catalog-only places for Dreamer Places tab (not Trip Wizard). */
export function dreamerPlaceIdeas(destination: string): {
  name: string;
  kind: string;
  note: string;
}[] {
  const dest = findCatalog(destination);
  if (!dest) return [];
  return (dest.attractions ?? []).slice(0, 8).map((name) => ({
    name,
    kind: "attraction",
    note: `Catalog place in ${dest.name} — confirm hours locally.`,
  }));
}
