import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import type { DiscoverInterest, DestinationRecord } from "@/lib/discover/types";
import { groqChat } from "@/lib/ai/groq";

export type NightAllocationCity = {
  city: string;
  country?: string;
  nights: number;
  /** Inclusive calendar days on this stop (usually nights + 1 for single-city; for multi-city last day may overlap transit). */
  days: number;
  why: string;
  attractionsSample: string[];
};

export type NightAllocationResult = {
  totalNights: number;
  cities: NightAllocationCity[];
  summary: string;
  source: "catalog" | "catalog+ai";
};

function findCatalogCity(name: string): DestinationRecord | undefined {
  const key = name.trim().toLowerCase();
  return DESTINATION_CATALOG.find(
    (d) =>
      d.name.toLowerCase() === key ||
      d.name.toLowerCase().includes(key) ||
      key.includes(d.name.toLowerCase()),
  );
}

function interestOverlap(
  record: DestinationRecord | undefined,
  interests: string[],
): number {
  if (!record || !interests.length) return 0;
  const set = new Set(interests.map((i) => i.toLowerCase()));
  return record.interests.filter((i) => set.has(i)).length;
}

/**
 * Allocate overnight stays across cities using catalog duration hints and
 * interest overlap. Deterministic; never invents cities not in the input list.
 */
export function allocateNightsCatalog(input: {
  cities: string[];
  totalNights: number;
  interests?: string[];
  pace?: "relaxed" | "balanced" | "packed";
}): NightAllocationResult {
  const totalNights = Math.max(1, Math.floor(input.totalNights) || 1);
  const cities = input.cities.map((c) => c.trim()).filter(Boolean);
  if (!cities.length) {
    return {
      totalNights,
      cities: [],
      summary: "Add at least one city to allocate nights.",
      source: "catalog",
    };
  }

  const pace = input.pace ?? "balanced";
  const paceBias = pace === "relaxed" ? 1.15 : pace === "packed" ? 0.9 : 1;

  const weights = cities.map((city) => {
    const record = findCatalogCity(city);
    const mid =
      record != null
        ? (record.durationDays.min + record.durationDays.max) / 2
        : 3;
    const interestBoost = 1 + 0.12 * interestOverlap(record, input.interests ?? []);
    return Math.max(1, mid * paceBias * interestBoost);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const raw = weights.map((w) => (w / weightSum) * totalNights);
  const floors = raw.map((n) => Math.max(1, Math.floor(n)));
  let used = floors.reduce((a, b) => a + b, 0);

  // If we overshot (many cities vs few nights), allow 1 night each then trim.
  if (used > totalNights) {
    const equal = cities.map(() => 1);
    let rem = totalNights - cities.length;
    // Prefer trimming from lowest-weight cities if too many cities for nights
    if (rem < 0) {
      // More cities than nights: give 1 to first N nights cities, 0 to rest — but
      // product requires at least 1 night for included cities; drop trailing cities.
      const keep = Math.max(1, totalNights);
      const kept = cities.slice(0, keep);
      return allocateNightsCatalog({
        ...input,
        cities: kept,
        totalNights,
      });
    }
    const order = weights
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w - a.w);
    const nights = [...equal];
    for (const { i } of order) {
      if (rem <= 0) break;
      nights[i] += 1;
      rem -= 1;
    }
    return finalize(cities, nights, totalNights, input.interests ?? [], "catalog");
  }

  let rem = totalNights - used;
  const order = raw
    .map((n, i) => ({ frac: n - Math.floor(n), i }))
    .sort((a, b) => b.frac - a.frac);
  const nights = [...floors];
  for (const { i } of order) {
    if (rem <= 0) break;
    nights[i] += 1;
    rem -= 1;
  }
  // Distribute any leftover
  let idx = 0;
  while (rem > 0) {
    nights[idx % nights.length] += 1;
    rem -= 1;
    idx += 1;
  }

  return finalize(cities, nights, totalNights, input.interests ?? [], "catalog");
}

function finalize(
  cities: string[],
  nights: number[],
  totalNights: number,
  interests: string[],
  source: NightAllocationResult["source"],
): NightAllocationResult {
  const rows: NightAllocationCity[] = cities.map((city, i) => {
    const record = findCatalogCity(city);
    const n = nights[i];
    const matched = interestOverlap(record, interests);
    const attractionsSample = (record?.attractions ?? []).slice(0, 3);
    const whyParts: string[] = [];
    if (record) {
      whyParts.push(
        `Catalog suggests about ${record.durationDays.min}–${record.durationDays.max} days here`,
      );
      if (matched > 0) {
        whyParts.push(
          `matches ${matched} of your interests (${record.interests
            .filter((x) => interests.map((i) => i.toLowerCase()).includes(x))
            .slice(0, 3)
            .join(", ")})`,
        );
      }
      if (record.transitNote) {
        whyParts.push(record.transitNote);
      }
    } else {
      whyParts.push(
        "Share of trip nights based on equal weighting with other stops (city not in destination catalog)",
      );
    }
    whyParts.push(`${n} night${n === 1 ? "" : "s"} of ${totalNights} total`);
    return {
      city,
      country: record?.country,
      nights: n,
      days: n + 1,
      why: whyParts.join(". ") + ".",
      attractionsSample,
    };
  });

  const summary = rows
    .map((r) => `${r.city}: ${r.nights} night${r.nights === 1 ? "" : "s"}`)
    .join(" · ");

  return { totalNights, cities: rows, summary, source };
}

/**
 * Recalculate after the user locks one city's nights.
 * Remaining nights are redistributed across unlocked cities.
 */
export function recalculateNights(input: {
  cities: { city: string; nights: number; locked?: boolean }[];
  totalNights: number;
  interests?: string[];
  pace?: "relaxed" | "balanced" | "packed";
}): NightAllocationResult {
  const totalNights = Math.max(1, Math.floor(input.totalNights) || 1);
  const locked = input.cities.filter((c) => c.locked);
  const unlocked = input.cities.filter((c) => !c.locked);
  const lockedSum = locked.reduce(
    (a, c) => a + Math.max(0, Math.floor(c.nights) || 0),
    0,
  );
  const remaining = Math.max(0, totalNights - lockedSum);

  if (!unlocked.length) {
    return finalize(
      input.cities.map((c) => c.city),
      input.cities.map((c) => Math.max(1, Math.floor(c.nights) || 1)),
      totalNights,
      input.interests ?? [],
      "catalog",
    );
  }

  const sub = allocateNightsCatalog({
    cities: unlocked.map((c) => c.city),
    totalNights: Math.max(unlocked.length, remaining),
    interests: input.interests,
    pace: input.pace,
  });

  // Scale if remaining < unlocked.length we already handled in allocateNightsCatalog
  const byCity = new Map(sub.cities.map((c) => [c.city.toLowerCase(), c.nights]));
  const nights = input.cities.map((c) => {
    if (c.locked) return Math.max(0, Math.floor(c.nights) || 0);
    return byCity.get(c.city.toLowerCase()) ?? 1;
  });

  // Fix sum to totalNights
  let sum = nights.reduce((a, b) => a + b, 0);
  const unlockedIdx = input.cities
    .map((c, i) => (!c.locked ? i : -1))
    .filter((i) => i >= 0);
  while (sum > totalNights && unlockedIdx.length) {
    const i = unlockedIdx.find((idx) => nights[idx] > 1) ?? unlockedIdx[0];
    if (nights[i] > 0) {
      nights[i] -= 1;
      sum -= 1;
    } else break;
  }
  let u = 0;
  while (sum < totalNights && unlockedIdx.length) {
    nights[unlockedIdx[u % unlockedIdx.length]] += 1;
    sum += 1;
    u += 1;
  }

  return finalize(
    input.cities.map((c) => c.city),
    nights,
    totalNights,
    input.interests ?? [],
    "catalog",
  );
}

/** Optional AI polish of "why" text — never changes night counts without validation. */
export async function enrichAllocationExplanations(
  allocation: NightAllocationResult,
  interests: string[],
): Promise<NightAllocationResult> {
  if (!allocation.cities.length) return allocation;
  const raw = await groqChat({
    optional: true,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You explain travel night allocations. Use only the cities and nights provided. Do not invent attractions not listed. Return JSON { explanations: string[] } same length as cities.",
      },
      {
        role: "user",
        content: JSON.stringify({
          interests,
          summary: allocation.summary,
          cities: allocation.cities.map((c) => ({
            city: c.city,
            nights: c.nights,
            attractionsSample: c.attractionsSample,
            existingWhy: c.why,
          })),
        }),
      },
    ],
    responseFormat: { type: "json_object" },
  });
  if (!raw) return allocation;
  try {
    const parsed = JSON.parse(raw) as { explanations?: unknown };
    const list = Array.isArray(parsed.explanations)
      ? parsed.explanations.map((x) => String(x))
      : [];
    if (list.length !== allocation.cities.length) return allocation;
    return {
      ...allocation,
      source: "catalog+ai",
      cities: allocation.cities.map((c, i) => ({
        ...c,
        why: list[i]?.trim() || c.why,
      })),
    };
  } catch {
    return allocation;
  }
}

export function parseCitiesFromIdea(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const d of DESTINATION_CATALOG) {
    if (lower.includes(d.name.toLowerCase())) found.push(d.name);
  }
  // Country → top catalog cities in that country
  if (!found.length) {
    for (const d of DESTINATION_CATALOG) {
      if (
        lower.includes(d.country.toLowerCase()) ||
        (d.countryCode === "JP" && /\bjapan\b/i.test(text))
      ) {
        // collect later
      }
    }
    const japan = /\bjapan\b/i.test(text);
    if (japan) {
      for (const name of ["Tokyo", "Kyoto", "Osaka"]) {
        if (DESTINATION_CATALOG.some((d) => d.name === name)) found.push(name);
      }
    }
    const europe = /\beurope\b/i.test(text);
    if (europe && !found.length) {
      for (const name of ["Paris", "Rome", "Barcelona"]) {
        if (DESTINATION_CATALOG.some((d) => d.name === name)) found.push(name);
      }
    }
  }
  return [...new Set(found)].slice(0, 6);
}

export function parseDurationDaysFromIdea(text: string): number | null {
  const days = text.match(/(\d+)\s*days?/i);
  if (days) return Math.max(1, Number(days[1]));
  const weeks = text.match(/(\d+)\s*weeks?/i);
  if (weeks) return Math.max(1, Number(weeks[1]) * 7);
  const nights = text.match(/(\d+)\s*nights?/i);
  if (nights) return Math.max(1, Number(nights[1]) + 1);
  return null;
}

export function parseInterestsFromIdea(text: string): DiscoverInterest[] {
  const INTEREST_WORDS: { re: RegExp; interest: DiscoverInterest }[] = [
    { re: /architect/i, interest: "architecture" },
    { re: /histor/i, interest: "history" },
    { re: /food|restaurant|cuisine/i, interest: "food" },
    { re: /nature|hike|outdoor/i, interest: "nature" },
    { re: /museum|gallery/i, interest: "museums" },
    { re: /nightlife|bar|club/i, interest: "nightlife" },
    { re: /shop/i, interest: "shopping" },
    { re: /cultur/i, interest: "culture" },
    { re: /adventure/i, interest: "adventure" },
    { re: /beach/i, interest: "beaches" },
  ];
  return [
    ...new Set(
      INTEREST_WORDS.filter((r) => r.re.test(text)).map((r) => r.interest),
    ),
  ];
}
