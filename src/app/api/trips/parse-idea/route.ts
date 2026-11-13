import { NextResponse } from "next/server";
import { z } from "zod";
import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import {
  allocateNightsCatalog,
  enrichAllocationExplanations,
  parseCitiesFromIdea,
  parseDurationDaysFromIdea,
  parseInterestsFromIdea,
} from "@/lib/trips/night-allocation";

const bodySchema = z.object({
  idea: z.string().min(3).max(800),
  pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Describe your trip idea in a short sentence." },
      { status: 400 },
    );
  }

  const idea = parsed.data.idea.trim();
  let cities = parseCitiesFromIdea(idea);
  const interests = parseInterestsFromIdea(idea);
  const durationDays = parseDurationDaysFromIdea(idea) ?? 10;
  const totalNights = Math.max(1, durationDays - 1);

  // Country-only ideas: pick top catalog cities in that country by interest fit
  if (!cities.length) {
    const countryHit = DESTINATION_CATALOG.find(
      (d) =>
        idea.toLowerCase().includes(d.country.toLowerCase()) ||
        (d.countryCode === "JP" && /\bjapan\b/i.test(idea)),
    );
    if (countryHit) {
      cities = DESTINATION_CATALOG.filter(
        (d) => d.countryCode === countryHit.countryCode,
      )
        .slice(0, 3)
        .map((d) => d.name);
    }
  }

  // Region-only ideas (e.g. "somewhere in Asia") — let Trip Architect Discover pick cities.
  const regionHint = (() => {
    const t = idea.toLowerCase();
    if (/\basia\b/.test(t)) return "asia";
    if (/\beurope\b/.test(t)) return "europe";
    if (/\bnorth america\b/.test(t)) return "north-america";
    if (/\blatin america\b/.test(t)) return "latin-america";
    if (/\bmiddle east\b/.test(t)) return "middle-east";
    if (/\bafrica\b/.test(t)) return "africa";
    if (/\boceania\b/.test(t)) return "oceania";
    return null;
  })();

  if (!cities.length) {
    return NextResponse.json({
      idea,
      cities: [],
      interests,
      durationDays,
      totalNights,
      allocation: null,
      region: regionHint,
      message: regionHint
        ? `No specific cities yet — pick destinations in ${regionHint.replace("-", " ")}.`
        : "Name a country or cities (for example: Japan, or Tokyo and Kyoto) so we can suggest nights.",
    });
  }

  let allocation = allocateNightsCatalog({
    cities,
    totalNights,
    interests,
    pace: parsed.data.pace,
  });
  allocation = await enrichAllocationExplanations(allocation, interests);

  return NextResponse.json({
    idea,
    cities,
    interests,
    durationDays,
    totalNights,
    allocation,
  });
}
