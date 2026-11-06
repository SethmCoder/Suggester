import { groqChat } from "@/lib/ai/groq";
import { resolveGeonameCity } from "@/lib/geonames/cities";
import { cacheGet, cacheSet } from "@/lib/http/accountless-fetch";
import { lookupWikipedia } from "@/lib/places/place-brief";

export type CityBrief = {
  name: string;
  summary: string;
  thumbnailUrl: string | null;
  population: number | null;
  countryCode: string | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCityBrief(name: string): Promise<CityBrief> {
  const trimmed = name.trim();
  const cacheKey = `city-brief:v5:${trimmed.toLowerCase()}`;
  const cached = cacheGet<CityBrief>(cacheKey);
  if (cached) return cached;

  const city = resolveGeonameCity(trimmed);
  const population = city && city.population > 0 ? city.population : null;
  const fact = population
    ? `Population from GeoNames: ${population.toLocaleString("en-US")}. Country code: ${city?.countryCode || "unknown"}.`
    : "Population is not in the city data.";
  const wiki = await lookupWikipedia(city?.name || trimmed).catch(() => null);
  const written = cleanCityParagraph(
    await cityParagraph({
      name: city?.name || trimmed,
      fact,
      sourceText: wiki?.extract ?? null,
    }).catch(() => null),
    population,
  );

  const brief: CityBrief = {
    name: city?.name || trimmed,
    summary: citySummary(
      city?.name || trimmed,
      written,
      fact,
      city?.countryCode || null,
      population,
    ),
    thumbnailUrl: wiki?.thumbnailUrl ?? null,
    population,
    countryCode: city?.countryCode || null,
  };
  if (written) cacheSet(cacheKey, brief, CACHE_TTL_MS);
  return brief;
}

function citySummary(
  name: string,
  written: string | null,
  fact: string,
  countryCode: string | null,
  population: number | null,
): string {
  if (!written) return `${name}. ${fact}`;
  const hasPopulation =
    population != null && written.includes(population.toLocaleString("en-US"));
  const hasMissing = written.toLowerCase().includes("not in the city data");
  if (!hasPopulation && !hasMissing) return `${written} ${fact}`;
  if (countryCode && !written.includes(countryCode)) {
    return `${written} Country code: ${countryCode}.`;
  }
  return written;
}

function cleanCityParagraph(
  written: string | null,
  population: number | null,
): string | null {
  if (!written) return null;
  const numbers = [...written.matchAll(/\d[\d,]{4,}/g)].map((match) =>
    Number(match[0].replace(/,/g, "")),
  );
  if (numbers.some((value) => value !== population)) return null;
  if (!population && numbers.length) return null;
  return written;
}

async function cityParagraph(input: {
  name: string;
  fact: string;
  sourceText: string | null;
}): Promise<string | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const text = await groqChat({
    temperature: 0.3,
    effort: "low",
    optional: true,
    messages: [
      {
        role: "system",
        content:
          "Write 2 to 4 sentences for a traveler about this city. Include the population fact exactly as given. Do not invent a different population, hotel, price, or opening hours. If a reference extract is provided, you may use it. If the fact says the population is not in the city data, say that in the summary and do not invent neighborhoods, atmosphere, or attractions.",
      },
      {
        role: "user",
        content: `City: ${input.name}
Fact: ${input.fact}
Reference: ${input.sourceText?.trim() || "none"}`,
      },
    ],
  });
  return text;
}
