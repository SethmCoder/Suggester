import { groqChat } from "@/lib/ai/groq";
import { accountlessFetch, cacheGet, cacheSet, waypointUserAgent } from "@/lib/http/accountless-fetch";

export type DistrictSpot = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  why: string;
};

type Candidate = Omit<DistrictSpot, "why">;

export async function districtSpots(input: {
  name: string;
  lat: number;
  lng: number;
  interests: string[];
}): Promise<DistrictSpot[]> {
  const interests = input.interests.map((item) => item.trim()).filter(Boolean).slice(0, 6);
  const cacheKey = `district-spots:v1:${input.name.toLowerCase()}:${input.lat.toFixed(2)}:${input.lng.toFixed(2)}:${interests.join(",")}`;
  const cached = cacheGet<DistrictSpot[]>(cacheKey);
  if (cached) return cached;
  const found = await findCandidates(input.lat, input.lng, interests);
  if (!found.length) return [];
  const picked = await chooseSpots(input.name, interests, found);
  const spots = picked.length ? picked : found.slice(0, 2).map((place) => ({
    ...place,
    why: `OpenStreetMap lists this near ${input.name}.`,
  }));
  cacheSet(cacheKey, spots, 6 * 60 * 60 * 1000);
  return spots;
}

function queriesFor(interests: string[]): string[] {
  const text = interests.join(" ").toLowerCase();
  const terms: string[] = [];
  if (/food|restaurant|dining|cuisine/.test(text)) terms.push("restaurant");
  if (/museum|art|gallery|culture/.test(text)) terms.push("museum");
  if (/shop|market/.test(text)) terms.push("market");
  if (/park|nature|beach|garden/.test(text)) terms.push("park");
  if (/architect|historic|monument/.test(text)) terms.push("monument");
  if (!terms.length) terms.push("attraction");
  return [...new Set(terms)].slice(0, 2);
}

async function findCandidates(lat: number, lng: number, interests: string[]): Promise<Candidate[]> {
  const seen = new Set<string>();
  const places: Candidate[] = [];
  for (const term of queriesFor(interests)) {
    const viewbox = `${lng - 0.045},${lat + 0.035},${lng + 0.045},${lat - 0.035}`;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(term)}`;
    try {
      const res = await accountlessFetch(url, {
        headers: { "User-Agent": waypointUserAgent(), Accept: "application/json" },
        timeoutMs: 12000,
      });
      if (!res.ok) continue;
      const rows = (await res.json()) as {
        osm_type?: string;
        osm_id?: number;
        lat?: string;
        lon?: string;
        name?: string;
        display_name?: string;
        type?: string;
      }[];
      for (const row of rows) {
        const name = row.name?.trim();
        const rowLat = Number(row.lat);
        const rowLng = Number(row.lon);
        if (!name || !row.osm_id || !Number.isFinite(rowLat) || !Number.isFinite(rowLng)) continue;
        const id = `osm:${row.osm_type}:${row.osm_id}`;
        if (seen.has(id) || seen.has(name.toLowerCase())) continue;
        seen.add(id);
        seen.add(name.toLowerCase());
        places.push({
          id,
          name,
          category: row.type || term,
          address: row.display_name ?? null,
          lat: rowLat,
          lng: rowLng,
        });
      }
    } catch {
      /* try the next search */
    }
  }
  return places.slice(0, 8);
}

async function chooseSpots(
  district: string,
  interests: string[],
  places: Candidate[],
): Promise<DistrictSpot[]> {
  if (!process.env.GROQ_API_KEY || places.length === 0) return [];
  try {
    const text =
      (await groqChat({
        temperature: 0.2,
        effort: "low",
        optional: true,
        responseFormat: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Pick exactly 2 places from the list that fit the traveler interests. Use only ids from the list. The why is one sentence and may only mention the place name, its category, and the interests. Do not invent ratings, hours, prices, or places. Reply with JSON {"picks":[{"id":"","why":""}]}.',
          },
          {
            role: "user",
            content: JSON.stringify({
              district,
              interests: interests.length ? interests : ["no interests saved"],
              places: places.map((place) => ({
                id: place.id,
                name: place.name,
                category: place.category,
              })),
            }),
          },
        ],
      })) || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as { picks?: { id?: string; why?: string }[] };
    const byId = new Map(places.map((place) => [place.id, place]));
    const spots: DistrictSpot[] = [];
    for (const pick of parsed.picks ?? []) {
      const place = pick.id ? byId.get(pick.id) : undefined;
      const why = pick.why?.trim();
      if (!place || !why || spots.some((spot) => spot.id === place.id)) continue;
      spots.push({ ...place, why: why.slice(0, 180) });
      if (spots.length >= 2) break;
    }
    return spots;
  } catch {
    return [];
  }
}
