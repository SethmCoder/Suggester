import { groqChat, groqVisionChat, groqVisionModel } from "@/lib/ai/groq";
import type { WishlistCategory } from "@/lib/wishlist/types";
import { WISHLIST_CATEGORIES } from "@/lib/wishlist/types";

export type ReelPlaceCandidate = {
  name: string;
  location: string | null;
  category: WishlistCategory;
  notes: string | null;
  sourceUrl: string | null;
  confidence: "high" | "medium" | "low";
};

const REEL_HOST =
  /(?:instagram\.com|instagr\.am|tiktok\.com|vm\.tiktok\.com|youtube\.com|youtu\.be)/i;

export function looksLikeReelUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return REEL_HOST.test(url.hostname);
  } catch {
    return /instagram\.com\/(?:reel|reels|p)\//i.test(value) ||
      /tiktok\.com\/@[\w.-]+\/video\//i.test(value);
  }
}

function asCategory(value: unknown): WishlistCategory {
  const raw = typeof value === "string" ? value.toLowerCase().trim() : "";
  if ((WISHLIST_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as WishlistCategory;
  }
  if (/food|eat|restaurant|dining/.test(raw)) return "restaurant";
  if (/cafe|coffee/.test(raw)) return "cafe";
  if (/museum|gallery/.test(raw)) return "museum";
  if (/hotel|stay|ryokan/.test(raw)) return "hotel";
  if (/park|hike|outdoor|beach/.test(raw)) return "outdoor";
  if (/neighbor|district|ward/.test(raw)) return "neighborhood";
  if (/city|country|destination|trip/.test(raw)) return "destination";
  return "attraction";
}

function normalizeCandidates(
  raw: unknown,
  sourceUrl: string | null,
): ReelPlaceCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: ReelPlaceCandidate[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const location =
      typeof item.location === "string" && item.location.trim()
        ? item.location.trim()
        : null;
    const notes =
      typeof item.notes === "string" && item.notes.trim()
        ? item.notes.trim().slice(0, 280)
        : null;
    const confidence =
      item.confidence === "high" || item.confidence === "low"
        ? item.confidence
        : "medium";
    out.push({
      name,
      location,
      category: asCategory(item.category),
      notes,
      sourceUrl,
      confidence,
    });
    if (out.length >= 8) break;
  }
  return out;
}

/** Lightweight fallback when Groq is unavailable. */
export function heuristicReelPlaces(input: {
  url?: string | null;
  text?: string | null;
}): ReelPlaceCandidate[] {
  const text = (input.text || "").trim();
  const sourceUrl = input.url?.trim() || null;
  const candidates: ReelPlaceCandidate[] = [];

  const tagged = [...text.matchAll(/#([A-Za-z][A-Za-z0-9_]{2,40})/g)].map(
    (m) => m[1]!.replace(/_/g, " "),
  );
  const atPlaces = [
    ...text.matchAll(
      /\b(?:in|at|near|visit(?:ing)?|to)\s+([A-Z][A-Za-z0-9'&.\- ]{2,40})/g,
    ),
  ].map((m) => m[1]!.trim());

  for (const name of [...atPlaces, ...tagged]) {
    if (name.length < 3) continue;
    if (/^(the|and|with|this|that|here|there)$/i.test(name)) continue;
    candidates.push({
      name: name.replace(/\s+/g, " ").trim(),
      location: null,
      category: "attraction",
      notes: sourceUrl ? `From reel ${sourceUrl}` : "From shared reel text",
      sourceUrl,
      confidence: "low",
    });
    if (candidates.length >= 5) break;
  }

  return normalizeCandidates(candidates, sourceUrl);
}

async function fetchReelHint(url: string): Promise<string> {
  try {
    const oembed = url.includes("tiktok.com")
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      : `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembed, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      html?: string;
    };
    return [data.title, data.author_name].filter(Boolean).join(" — ");
  } catch {
    return "";
  }
}

const SYSTEM = `You extract travel wishlist places from Instagram/TikTok/YouTube Shorts reel text or screenshots.
Return JSON only: {"places":[{"name":"...","location":"city or null","category":"attraction|restaurant|cafe|museum|hotel|neighborhood|outdoor|experience|destination|custom","notes":"short why or null","confidence":"high|medium|low"}]}
Rules:
- Only real places/experiences a traveler could visit. No influencers, brands-only, or vague vibes.
- Prefer specific named stops (Tokyo Tower, Shibuya Sky) over generic "Japan trip".
- location should be a city/region when known.
- Max 8 places. If nothing concrete, return {"places":[]}.`;

export async function extractPlacesFromReel(input: {
  url?: string | null;
  text?: string | null;
  imageDataUrl?: string | null;
}): Promise<{ places: ReelPlaceCandidate[]; notice?: string }> {
  const url = input.url?.trim() || null;
  const text = input.text?.trim() || "";
  const image = input.imageDataUrl?.trim() || null;
  if (!url && !text && !image) {
    return { places: [], notice: "Paste a reel link, caption, or screenshot." };
  }

  let hint = "";
  if (url && looksLikeReelUrl(url)) {
    hint = await fetchReelHint(url);
  }

  const bundle = [
    url ? `URL: ${url}` : null,
    hint ? `Public metadata: ${hint}` : null,
    text ? `Caption / pasted text:\n${text.slice(0, 6000)}` : null,
    !text && !image
      ? "No caption provided — use only the URL metadata if useful."
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: string | null = null;
  if (image) {
    raw = await groqVisionChat({
      model: groqVisionModel(),
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${bundle}\n\nAlso read on-screen place names from this reel screenshot.`,
            },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });
  } else {
    raw = await groqChat({
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: bundle },
      ],
    });
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { places?: unknown };
      const places = normalizeCandidates(parsed.places, url);
      if (places.length) return { places };
    } catch {
      /* fall through */
    }
  }

  const fallback = heuristicReelPlaces({ url, text: `${hint}\n${text}` });
  if (fallback.length) {
    return {
      places: fallback,
      notice:
        "AI was unavailable — showing quick guesses from the caption. Review before saving.",
    };
  }

  return {
    places: [],
    notice:
      url && !text && !image
        ? "Most reels hide captions from public metadata. Paste the caption or drop a screenshot of the places shown."
        : "Couldn’t find concrete places. Paste more of the caption or a clearer screenshot.",
  };
}
