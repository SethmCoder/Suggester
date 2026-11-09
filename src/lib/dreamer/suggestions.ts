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
 * Never invents event dates or festivals.
 */
export function buildDreamerSuggestions(input: {
  destination: string;
  month?: number | null;
  stayDays?: number | null;
  forecastNote?: string | null;
}): DreamerSuggestion[] {
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
      if (cooler.length) {
        out.push({
          id: "climate-cooler",
          kind: "climate",
          title: "Cooler places around your trip",
          body: `Since ${dest.name} is typically warm then, you could schedule something cooler before or after — catalog neighbors: ${cooler.map((c) => c.name).join(", ")}.`,
          confidence: "catalog",
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
        title: "Stay length",
        body: `You mentioned ${input.stayDays} days. Catalog guidance for ${dest.name} is usually ${min}–${max} days — consider a longer stay if you like ${dest.experiences[0] ?? "the city"}.`,
        confidence: "catalog",
      });
    } else if (input.stayDays > max) {
      out.push({
        id: "stay-long",
        kind: "stay",
        title: "Stay length",
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
