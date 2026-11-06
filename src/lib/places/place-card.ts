import { cacheGet, cacheSet } from "@/lib/http/accountless-fetch";
import { lookupWikipedia, plannerParagraph } from "@/lib/places/place-brief";

export type PlaceCardCopy = {
  thumbnailUrl: string | null;
  paragraph: string | null;
};

function stripCounts(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/population/i.test(sentence) && !/\d[\d,]{4,}/.test(sentence))
    .join(" ")
    .trim();
}

function cleanName(name: string): string {
  return name.replace(/\(demo\)/gi, "").replace(/\s+/g, " ").trim();
}

/** Photo and a short description for a stop card. Does not invent missing facts. */
export async function getPlaceCard(input: {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
}): Promise<PlaceCardCopy> {
  const name = cleanName(input.name) || input.name.trim();
  const cacheKey = `place-card:v4:${name.toLowerCase()}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}`;
  const cached = cacheGet<PlaceCardCopy>(cacheKey);
  if (cached) return cached;
  const wiki =
    (await lookupWikipedia(name).catch(() => null)) ??
    (input.address ? await lookupWikipedia(input.address.split(",")[0] ?? "").catch(() => null) : null);
  const extract = wiki?.extract?.trim() || "";
  const written = extract
    ? null
    : await plannerParagraph({
        name,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        sourceText:
          "No article text was found. Say only that this stop is on the itinerary and that details should be checked on site. Do not describe the setting, the view, or what a visitor does there.",
      }).catch(() => null);
  const paragraph = stripCounts(extract || written || "") || null;
  const card: PlaceCardCopy = {
    thumbnailUrl: wiki?.thumbnailUrl ?? null,
    paragraph,
  };
  if (paragraph) cacheSet(cacheKey, card, 24 * 60 * 60 * 1000);
  return card;
}
