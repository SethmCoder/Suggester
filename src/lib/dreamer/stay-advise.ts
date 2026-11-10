import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import type { DreamerStayAdvise, DreamerStayEvent } from "./types";

const DATE_RE =
  /\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+20\d{2})?)\b/i;

function normalizeIsoish(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function extractDatedEvents(
  results: { title?: string; link?: string; snippet?: string }[],
): DreamerStayEvent[] {
  const out: DreamerStayEvent[] = [];
  for (const r of results) {
    const blob = `${r.title ?? ""}\n${r.snippet ?? ""}`;
    const m = blob.match(DATE_RE);
    if (!m?.[1]) continue;
    const date = normalizeIsoish(m[1]);
    if (!date) continue;
    if (!r.link) continue;
    out.push({
      title: (r.title ?? "Event").slice(0, 120),
      date,
      sourceUrl: r.link,
      snippet: (r.snippet ?? "").slice(0, 240),
    });
    if (out.length >= 5) break;
  }
  return out;
}

export async function searchDatedEvents(input: {
  city: string;
  afterDate: string;
}): Promise<DreamerStayEvent[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];

  const q = `${input.city} festival fair concert event after ${input.afterDate}`;
  try {
    const params = new URLSearchParams({
      engine: "google",
      q,
      api_key: key,
      num: "8",
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      organic_results?: { title?: string; link?: string; snippet?: string }[];
    };
    return extractDatedEvents(data.organic_results ?? []);
  } catch {
    return [];
  }
}

/** Pure helper for tests — only keep events whose date is in the snippet/title. */
export function stayAdviseFromEvents(input: {
  city: string;
  landDate: string;
  events: DreamerStayEvent[];
}): DreamerStayAdvise {
  const dest = DESTINATION_CATALOG.find(
    (d) =>
      input.city.toLowerCase().includes(d.name.toLowerCase()) ||
      d.name.toLowerCase().includes(input.city.split(",")[0]?.trim().toLowerCase() ?? ""),
  );
  const catalogStayHint = dest
    ? `Catalog stay guidance for ${dest.name} is usually ${dest.durationDays.min}–${dest.durationDays.max} days (not a dated event).`
    : null;

  const land = Date.parse(`${input.landDate}T12:00:00`);
  const afterLand = input.events
    .filter((e) => {
      const t = Date.parse(`${e.date}T12:00:00`);
      return Number.isFinite(t) && Number.isFinite(land) && t >= land;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!afterLand.length) {
    return {
      events: [],
      stayUntil: null,
      rationale:
        "No dated events found in search results after your arrival. Stay-until dates are not invented without concrete evidence.",
      catalogStayHint,
    };
  }

  const chosen = afterLand[0]!;
  return {
    events: afterLand.slice(0, 5),
    stayUntil: chosen.date,
    rationale: `You land in ${input.city} on ${input.landDate}. A cited source lists “${chosen.title}” on ${chosen.date}. If you value that event, stay at least until ${chosen.date}.`,
    catalogStayHint,
  };
}

export async function buildStayAdvise(input: {
  city: string;
  landDate: string;
}): Promise<DreamerStayAdvise> {
  const events = await searchDatedEvents({
    city: input.city,
    afterDate: input.landDate,
  });
  return stayAdviseFromEvents({
    city: input.city,
    landDate: input.landDate,
    events,
  });
}
