/** Curated Unsplash CDN URLs (no API key; not stored in DB). */
const LIBRARY: Record<string, string> = {
  seattle:
    "https://images.unsplash.com/photo-1502175353174-a7a70e73b362?auto=format&fit=crop&w=1800&q=80",
  portland:
    "https://images.unsplash.com/photo-1555617980-0d4c8f1b3f3a?auto=format&fit=crop&w=1600&q=80",
  "san francisco":
    "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1600&q=80",
  "los angeles":
    "https://images.unsplash.com/photo-1515896769750-31548ba905f0?auto=format&fit=crop&w=1600&q=80",
  chicago:
    "https://images.unsplash.com/photo-1494522358652-f30e61a60313?auto=format&fit=crop&w=1600&q=80",
  boston:
    "https://images.unsplash.com/photo-1501979376757-4e74d90c3d9f?auto=format&fit=crop&w=1600&q=80",
  miami:
    "https://images.unsplash.com/photo-1514214240173-0fe749fb19d1?auto=format&fit=crop&w=1600&q=80",
  denver:
    "https://images.unsplash.com/photo-1546156929-a4c0ac411f47?auto=format&fit=crop&w=1600&q=80",
  austin:
    "https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=1600&q=80",
  vancouver:
    "https://images.unsplash.com/photo-1559511260-66a654ae982a?auto=format&fit=crop&w=1600&q=80",
  paris:
    "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80",
  tokyo:
    "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80",
  japan:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80",
  fuji:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80",
  "new york":
    "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80",
  london:
    "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80",
  rome:
    "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80",
  bali:
    "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
  barcelona:
    "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80",
  sydney:
    "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1600&q=80",
  singapore:
    "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1600&q=80",
  berlin:
    "https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=1600&q=80",
  amsterdam:
    "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1600&q=80",
};

const FALLBACK =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80";

const HERO =
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1800&q=80";

export function destinationImageUrl(destination: string): string {
  const key = destination.toLowerCase();
  // Prefer longer keys first (e.g. "new york" before "york")
  const entries = Object.entries(LIBRARY).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [city, url] of entries) {
    if (key.includes(city)) return url;
  }
  return FALLBACK;
}

/** True when we have a curated photo for this place name. */
export function hasCuratedCityImage(destination: string): boolean {
  const key = destination.toLowerCase();
  return Object.keys(LIBRARY).some((city) => key.includes(city));
}

export function countryFromDestination(destination: string): string {
  const parts = destination.split(",").map((s) => s.trim());
  if (parts.length > 1) return parts[parts.length - 1];
  const key = destination.toLowerCase();
  if (key.includes("paris")) return "France";
  if (key.includes("tokyo") || key.includes("japan")) return "Japan";
  if (key.includes("new york") || key.includes("seattle")) return "United States";
  if (key.includes("london")) return "United Kingdom";
  return "Destination";
}

export function dashboardHeroImage(cityHint?: string | null): string {
  if (cityHint) return destinationImageUrl(cityHint);
  return HERO;
}
