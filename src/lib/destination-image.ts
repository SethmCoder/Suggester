/** Curated Unsplash CDN URLs (no API key; not stored in DB). */
const LIBRARY: Record<string, string> = {
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
};

const FALLBACK =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80";

const HERO =
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1800&q=80";

export function destinationImageUrl(destination: string): string {
  const key = destination.toLowerCase();
  for (const [city, url] of Object.entries(LIBRARY)) {
    if (key.includes(city)) return url;
  }
  return FALLBACK;
}

export function countryFromDestination(destination: string): string {
  const parts = destination.split(",").map((s) => s.trim());
  if (parts.length > 1) return parts[parts.length - 1];
  const key = destination.toLowerCase();
  if (key.includes("paris")) return "France";
  if (key.includes("tokyo") || key.includes("japan")) return "Japan";
  if (key.includes("new york")) return "United States";
  if (key.includes("london")) return "United Kingdom";
  return "Destination";
}

export function dashboardHeroImage(): string {
  return HERO;
}
