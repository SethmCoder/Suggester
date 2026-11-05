/**
 * Short place card: Wikipedia when a page matches, otherwise a planner
 * paragraph. Booking links are real URLs only. Reviews are never written here.
 */

import Groq from "groq-sdk";
import { quotesForHotelName } from "@/lib/hotels/hotelrec";
import {
  accountlessFetch,
  cacheGet,
  cacheSet,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";

export type PlaceLink = {
  label: string;
  url: string;
  kind: "official" | "article" | "maps" | "tickets";
};

export type PlaceReview = {
  author: string;
  text: string;
  rating: number | null;
  source: string;
  url: string | null;
  title?: string;
};

export type PlaceBrief = {
  name: string;
  paragraph: string;
  /** wikipedia = cited article extract; planner = written on the spot */
  paragraphSource: "wikipedia" | "planner";
  articleTitle: string | null;
  thumbnailUrl: string | null;
  links: PlaceLink[];
  reviews: PlaceReview[];
  reviewsNote: string;
  /** hotelrec reviews replace Google for lodging; google is unchanged for other places. */
  reviewsKind: "hotelrec" | "google" | "none";
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function looksLikeLodging(name: string): boolean {
  const plain = name.normalize("NFD").replace(/\p{M}/gu, "");
  if (/hotel de ville|city hall|town hall/i.test(plain)) return false;
  return /\b(hotel|hostel|motel|resort|inn|lodge|suites|aparthotel)\b/i.test(plain);
}

function cleanName(name: string): string {
  return name
    .replace(/\(demo\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleLooksRelated(query: string, title: string): boolean {
  const stop = new Set([
    "demo",
    "area",
    "walk",
    "stroll",
    "exterior",
    "sunset",
    "visit",
    "tour",
  ]);
  const words = cleanName(query)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  if (!words.length) return false;
  const t = title.toLowerCase();
  return words.some((w) => t.includes(w));
}

async function wikipediaBrief(
  name: string,
): Promise<{
  title: string;
  extract: string;
  thumbnailUrl: string | null;
  pageUrl: string;
} | null> {
  const headers = {
    "User-Agent": waypointUserAgent(),
    Accept: "application/json",
  };
  const search = new URL("https://en.wikipedia.org/w/api.php");
  search.searchParams.set("action", "query");
  search.searchParams.set("list", "search");
  search.searchParams.set("srsearch", cleanName(name));
  search.searchParams.set("srlimit", "3");
  search.searchParams.set("format", "json");
  const searchRes = await accountlessFetch(search.toString(), {
    headers,
    timeoutMs: 10000,
  });
  if (!searchRes.ok) return null;
  const searchJson = (await searchRes.json()) as {
    query?: { search?: { title?: string }[] };
  };
  const title = (searchJson.query?.search ?? [])
    .map((hit) => hit.title)
    .find((t): t is string => typeof t === "string" && titleLooksRelated(name, t));
  if (!title) return null;

  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const summaryRes = await accountlessFetch(summaryUrl, {
    headers,
    timeoutMs: 10000,
  });
  if (!summaryRes.ok) return null;
  const data = (await summaryRes.json()) as {
    type?: string;
    title?: string;
    extract?: string;
    thumbnail?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  };
  if (data.type === "disambiguation") return null;
  const extract = data.extract?.trim() ?? "";
  if (extract.length < 40) return null;
  return {
    title: data.title ?? title,
    extract,
    thumbnailUrl: data.thumbnail?.source ?? null,
    pageUrl:
      data.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  };
}

async function osmWebsite(
  name: string,
  lat: number,
  lng: number,
): Promise<string | null> {
  const params = new URLSearchParams({
    q: cleanName(name),
    format: "jsonv2",
    limit: "1",
    extratags: "1",
    lat: String(lat),
    lon: String(lng),
  });
  const res = await accountlessFetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        "User-Agent": waypointUserAgent(),
        Accept: "application/json",
      },
      timeoutMs: 10000,
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as {
    extratags?: Record<string, string>;
  }[];
  const tags = rows[0]?.extratags ?? {};
  const site = tags.website || tags.url || tags["contact:website"] || "";
  if (!/^https?:\/\//i.test(site)) return null;
  return site;
}

async function plannerParagraph(input: {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
}): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const client = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You write a short traveler-facing explanation of a place. 2 to 4 sentences. Use only general public knowledge. If you are unsure, say what kind of place the name suggests and that details should be checked on site. Do not invent reviews, star ratings, prices, opening hours, or booking links. Do not pretend a visitor said anything.",
      },
      {
        role: "user",
        content: `Place: ${cleanName(input.name)}
Address: ${input.address?.trim() || "unknown"}
Coordinates: ${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}`,
      },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim();
  return text || null;
}

async function googleReviews(input: {
  name: string;
  lat: number;
  lng: number;
}): Promise<{ reviews: PlaceReview[]; website: string | null; mapsUrl: string | null }> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return { reviews: [], website: null, mapsUrl: null };
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.websiteUri,places.googleMapsUri,places.reviews",
      },
      body: JSON.stringify({
        textQuery: cleanName(input.name),
        locationBias: {
          circle: {
            center: { latitude: input.lat, longitude: input.lng },
            radius: 2000,
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { reviews: [], website: null, mapsUrl: null };
    const data = (await res.json()) as {
      places?: {
        websiteUri?: string;
        googleMapsUri?: string;
        reviews?: {
          rating?: number;
          text?: { text?: string };
          authorAttribution?: { displayName?: string; uri?: string };
        }[];
      }[];
    };
    const place = data.places?.[0];
    const reviews: PlaceReview[] = [];
    for (const review of place?.reviews ?? []) {
      const text = review.text?.text?.trim();
      const author = review.authorAttribution?.displayName?.trim();
      if (!text || !author) continue;
      reviews.push({
        author,
        text,
        rating: typeof review.rating === "number" ? review.rating : null,
        source: "Google",
        url: review.authorAttribution?.uri ?? place?.googleMapsUri ?? null,
      });
    }
    return {
      reviews,
      website: place?.websiteUri ?? null,
      mapsUrl: place?.googleMapsUri ?? null,
    };
  } catch {
    return { reviews: [], website: null, mapsUrl: null };
  }
}

export async function getPlaceBrief(input: {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
}): Promise<PlaceBrief> {
  const name = cleanName(input.name) || input.name.trim();
  const cacheKey = `place-brief:${name.toLowerCase()}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}`;
  const cached = cacheGet<PlaceBrief>(cacheKey);
  if (cached) return cached;

  const [wiki, site, google] = await Promise.all([
    wikipediaBrief(name).catch(() => null),
    osmWebsite(name, input.lat, input.lng).catch(() => null),
    googleReviews({ name, lat: input.lat, lng: input.lng }),
  ]);

  let paragraph = wiki?.extract ?? "";
  let paragraphSource: PlaceBrief["paragraphSource"] = "wikipedia";
  if (!paragraph) {
    paragraph =
      (await plannerParagraph(input).catch(() => null)) ??
      `${name} is a stop on this itinerary${input.address ? ` (${input.address})` : ""}. No reference article was found, and the planner could not write a description just now.`;
    paragraphSource = "planner";
  }

  const mapsUrl =
    google.mapsUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${input.lat},${input.lng}`)}`;
  const official = google.website || site;
  const links: PlaceLink[] = [];
  if (official) {
    links.push({ label: "Official website", url: official, kind: "official" });
  }
  if (wiki?.pageUrl) {
    links.push({
      label: `Wikipedia — ${wiki.title}`,
      url: wiki.pageUrl,
      kind: "article",
    });
  }
  links.push({ label: "Open in Google Maps", url: mapsUrl, kind: "maps" });
  links.push({
    label: "Search for tickets",
    url: `https://www.google.com/search?q=${encodeURIComponent(`book tickets ${name}`)}`,
    kind: "tickets",
  });

  const lodging = looksLikeLodging(name);
  const hotelHit = quotesForHotelName(name).hotel;
  const useHotelRec = lodging || Boolean(hotelHit);
  const hotelReviews: PlaceReview[] = useHotelRec
    ? (hotelHit?.quotes ?? []).map((quote) => ({
        author: quote.author,
        text: quote.text,
        title: quote.title || undefined,
        rating: quote.rating,
        source: "HotelRec",
        url: "https://github.com/diegoantognini/HotelRec",
      }))
    : [];
  const reviews = useHotelRec ? hotelReviews : google.reviews;
  const reviewsKind: PlaceBrief["reviewsKind"] = useHotelRec
    ? "hotelrec"
    : reviews.length
      ? "google"
      : "none";
  const reviewsNote = useHotelRec
    ? hotelReviews.length
      ? `Reviews are quoted from HotelRec (Antognini & Faltings, LREC 2020), a TripAdvisor-derived dataset${hotelHit ? ` — ${hotelHit.rating.toFixed(1)}/5 across ${hotelHit.reviewCount} reviews in this sample` : ""}. Waypoint does not write reviews.`
      : "No HotelRec reviews are available for this hotel. Waypoint does not invent reviews."
    : reviews.length
      ? "Reviews are copied from Google. Waypoint does not write reviews."
      : "No published reviews were returned for this place. Waypoint does not invent reviews.";

  const brief: PlaceBrief = {
    name,
    paragraph,
    paragraphSource,
    articleTitle: wiki?.title ?? null,
    thumbnailUrl: wiki?.thumbnailUrl ?? null,
    links,
    reviews,
    reviewsNote,
    reviewsKind,
  };
  cacheSet(cacheKey, brief, CACHE_TTL_MS);
  return brief;
}
