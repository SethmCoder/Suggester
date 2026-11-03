/**
 * Live hero images for cities outside the curated library.
 * 1) Wikipedia/Wikimedia page thumbnail (free, no account)
 * 2) Optional Unsplash Search API if UNSPLASH_ACCESS_KEY is set
 * 3) null → caller uses generic fallback
 */

import {
  accountlessFetch,
  cacheGet,
  cacheSet,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";
import { resolveHeroMetro } from "@/lib/destination-image";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LiveHeroResult = {
  imageUrl: string;
  caption: string;
  source: "curated" | "wikipedia" | "unsplash" | "fallback";
  attribution?: string | null;
};

async function wikipediaThumbnail(
  place: string,
): Promise<{ url: string; title: string } | null> {
  const title = place.trim().replace(/ /g, "_");
  if (!title) return null;
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await accountlessFetch(url, {
      headers: {
        "User-Agent": waypointUserAgent(),
        Accept: "application/json",
      },
      timeoutMs: 12000,
      retryOnce: false,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
      type?: string;
    };
    // Skip disambiguation / missing
    if (data.type === "disambiguation") return null;
    const src =
      data.originalimage?.source || data.thumbnail?.source || null;
    if (!src) return null;
    // Prefer a wider crop-ish URL when Wikimedia serves width variants
    const wide = src.replace(/\/\d+px-/, "/1600px-");
    return { url: wide, title: data.title ?? place };
  } catch {
    return null;
  }
}

async function unsplashSearch(
  place: string,
): Promise<{ url: string; attribution: string } | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return null;
  try {
    const params = new URLSearchParams({
      query: `${place} city skyline`,
      orientation: "landscape",
      per_page: "1",
      content_filter: "high",
    });
    const res = await accountlessFetch(
      `https://api.unsplash.com/search/photos?${params}`,
      {
        headers: {
          Authorization: `Client-ID ${key}`,
          "Accept-Version": "v1",
          "User-Agent": waypointUserAgent(),
        },
        timeoutMs: 12000,
        retryOnce: false,
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: {
        urls?: { regular?: string; full?: string };
        user?: { name?: string; links?: { html?: string } };
        links?: { html?: string };
      }[];
    };
    const hit = data.results?.[0];
    const image = hit?.urls?.regular || hit?.urls?.full;
    if (!image) return null;
    const photographer = hit.user?.name ?? "Unsplash";
    const attr = `Photo by ${photographer} on Unsplash`;
    return { url: image, attribution: attr };
  } catch {
    return null;
  }
}

/**
 * Resolve a hero image for any place name.
 * Curated metros win; otherwise Wikipedia; optional Unsplash; then fallback URL.
 */
export async function resolveLiveHeroImage(
  place: string,
  fallbackUrl: string,
): Promise<LiveHeroResult> {
  const trimmed = place.trim();
  const cacheKey = `hero-live:${trimmed.toLowerCase()}`;
  const cached = cacheGet<LiveHeroResult>(cacheKey);
  if (cached) return cached;

  const curated = resolveHeroMetro(trimmed);
  if (curated.matched && curated.metro) {
    const result: LiveHeroResult = {
      imageUrl: curated.imageUrl,
      caption: curated.caption ?? curated.metro,
      source: "curated",
    };
    cacheSet(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  // Prefer Unsplash when keyed (often better hero crops), else Wikipedia
  const unsplash = await unsplashSearch(trimmed);
  if (unsplash) {
    const result: LiveHeroResult = {
      imageUrl: unsplash.url,
      caption: trimmed,
      source: "unsplash",
      attribution: unsplash.attribution,
    };
    cacheSet(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  const wiki = await wikipediaThumbnail(trimmed);
  if (wiki) {
    const result: LiveHeroResult = {
      imageUrl: wiki.url,
      caption: wiki.title,
      source: "wikipedia",
      attribution: "Image via Wikipedia / Wikimedia Commons",
    };
    cacheSet(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  // Try metro caption place for wiki (e.g. already unmatched suburb with no page)
  const result: LiveHeroResult = {
    imageUrl: fallbackUrl,
    caption: curated.caption ?? trimmed,
    source: "fallback",
  };
  cacheSet(cacheKey, result, CACHE_TTL_MS);
  return result;
}
