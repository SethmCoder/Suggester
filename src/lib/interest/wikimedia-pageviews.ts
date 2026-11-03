import {
  accountlessFetch,
  cacheGet,
  cacheSet,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";
import type {
  InterestConfidence,
  OnlineInterestClass,
  OnlineInterestSignal,
} from "@/lib/places/types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BASE =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Latest complete UTC day is yesterday. */
function periodEnds(now = new Date()): {
  recentStart: string;
  recentEnd: string;
  prevStart: string;
  prevEnd: string;
} {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const recentStart = new Date(end);
  recentStart.setUTCDate(end.getUTCDate() - 6);
  const prevEnd = new Date(recentStart);
  prevEnd.setUTCDate(recentStart.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevEnd.getUTCDate() - 6);
  return {
    recentStart: ymd(recentStart),
    recentEnd: ymd(end),
    prevStart: ymd(prevStart),
    prevEnd: ymd(prevEnd),
  };
}

export function classifyPageviewChange(input: {
  recentViews: number;
  previousViews: number;
  minBaseline?: number;
}): {
  classification: OnlineInterestClass;
  percentChange: number | null;
  confidence: InterestConfidence;
} {
  const baseline = input.minBaseline ?? 200;
  if (input.previousViews < baseline) {
    return {
      classification: null,
      percentChange: null,
      confidence: "none",
    };
  }
  const pct =
    ((input.recentViews - input.previousViews) / input.previousViews) * 100;
  let classification: OnlineInterestClass = "stable";
  if (pct >= 15) classification = "increasing";
  else if (pct <= -15) classification = "decreasing";

  const conf: InterestConfidence =
    input.previousViews >= 2000
      ? "high"
      : input.previousViews >= 500
        ? "medium"
        : "low";

  return {
    classification,
    percentChange: Math.round(pct * 10) / 10,
    confidence: conf,
  };
}

function interestLabel(
  c: OnlineInterestClass,
): string | null {
  if (c === "increasing") return "Online interest increasing";
  if (c === "decreasing") return null; // don't badge declines
  if (c === "stable") return null;
  return null;
}

async function fetchPeriodViews(
  title: string,
  start: string,
  end: string,
): Promise<number | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `${BASE}/en.wikipedia/all-access/user/${encoded}/daily/${start}/${end}`;
  const cacheKey = `wiki-pv:${encoded}:${start}:${end}`;
  const cached = cacheGet<number>(cacheKey);
  if (cached != null) return cached;

  try {
    const res = await accountlessFetch(url, {
      headers: { "User-Agent": waypointUserAgent() },
      timeoutMs: 15000,
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { views?: number }[];
    };
    const total = (data.items ?? []).reduce(
      (s, i) => s + (i.views ?? 0),
      0,
    );
    cacheSet(cacheKey, total, CACHE_TTL_MS);
    return total;
  } catch {
    return null;
  }
}

/**
 * Score online interest from Wikimedia pageviews for a verified Wikipedia title.
 * No title / failed fetch → neutral signal (no fabricated popularity).
 */
export async function scoreWikipediaInterest(input: {
  placeId: string;
  wikipediaTitle: string | null | undefined;
}): Promise<OnlineInterestSignal> {
  const now = new Date().toISOString();
  const empty: OnlineInterestSignal = {
    placeId: input.placeId,
    wikipediaTitle: input.wikipediaTitle ?? null,
    classification: null,
    confidence: "none",
    percentChange: null,
    recentViews: null,
    previousViews: null,
    label: null,
    source: "wikimedia_pageviews",
    retrievedAt: now,
  };

  const title = input.wikipediaTitle?.trim();
  if (!title) return empty;

  const signalCacheKey = `wiki-signal:${input.placeId}:${title}`;
  const cached = cacheGet<OnlineInterestSignal>(signalCacheKey);
  if (cached) return cached;

  const periods = periodEnds();
  const [recent, previous] = await Promise.all([
    fetchPeriodViews(title, periods.recentStart, periods.recentEnd),
    fetchPeriodViews(title, periods.prevStart, periods.prevEnd),
  ]);

  if (recent == null || previous == null) {
    cacheSet(signalCacheKey, empty, CACHE_TTL_MS);
    return empty;
  }

  const { classification, percentChange, confidence } =
    classifyPageviewChange({
      recentViews: recent,
      previousViews: previous,
    });

  const signal: OnlineInterestSignal = {
    placeId: input.placeId,
    wikipediaTitle: title,
    classification,
    confidence,
    percentChange,
    recentViews: recent,
    previousViews: previous,
    label: interestLabel(classification),
    source: "wikimedia_pageviews",
    retrievedAt: now,
  };
  cacheSet(signalCacheKey, signal, CACHE_TTL_MS);
  return signal;
}

/** Batch with concurrency via accountless-fetch queue; skip places without titles. */
export async function scorePlacesOnlineInterest(
  places: { placeId: string; wikipediaTitle?: string | null }[],
): Promise<Map<string, OnlineInterestSignal>> {
  const map = new Map<string, OnlineInterestSignal>();
  const withTitles = places.filter((p) => p.wikipediaTitle);
  // Cap live lookups per generation
  const limited = withTitles.slice(0, 20);
  for (const p of limited) {
    const signal = await scoreWikipediaInterest({
      placeId: p.placeId,
      wikipediaTitle: p.wikipediaTitle,
    });
    map.set(p.placeId, signal);
  }
  return map;
}

/** High-confidence title match: exact OSM wikipedia tag only (no guessing). */
export function resolveWikipediaTitle(input: {
  osmWikipediaTag?: string | null;
  displayName?: string;
}): string | null {
  if (input.osmWikipediaTag) {
    const parts = input.osmWikipediaTag.split(":");
    const title =
      parts.length > 1 ? parts.slice(1).join(":") : parts[0];
    return title.trim().replace(/ /g, "_") || null;
  }
  // Do not invent article titles from display names.
  return null;
}
