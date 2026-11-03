/** Curated Unsplash CDN URLs keyed by metro hub (no API key; not stored in DB). */
const LIBRARY: Record<string, string> = {
  seattle:
    "https://images.unsplash.com/photo-1502175353174-a7a70e73b362?auto=format&fit=crop&w=1800&q=80",
  portland:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1600&q=80",
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
  washington:
    "https://images.unsplash.com/photo-1617581629397-a72507c3de9e?auto=format&fit=crop&w=1600&q=80",
  dubai:
    "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1800&q=80",
};

/**
 * Map suburbs / nearby cities → metro hub used for hero photos.
 * Keys are lowercase substrings matched against the resolved place name.
 */
const METRO_ALIASES: Record<string, string> = {
  // Greater Seattle
  bellevue: "seattle",
  redmond: "seattle",
  kirkland: "seattle",
  renton: "seattle",
  tacoma: "seattle",
  everett: "seattle",
  bothell: "seattle",
  lynnwood: "seattle",
  "federal way": "seattle",
  kent: "seattle",
  sammamish: "seattle",
  issaquah: "seattle",
  mercer: "seattle",
  "shoreline": "seattle",
  tukwila: "seattle",
  auburn: "seattle",
  "sea-tac": "seattle",
  seatac: "seattle",
  // Bay Area
  oakland: "san francisco",
  berkeley: "san francisco",
  "san jose": "san francisco",
  "palo alto": "san francisco",
  sunnyvale: "san francisco",
  // LA basin
  "santa monica": "los angeles",
  pasadena: "los angeles",
  "long beach": "los angeles",
  // NYC metro
  brooklyn: "new york",
  queens: "new york",
  manhattan: "new york",
  jersey: "new york",
  newark: "new york",
  // Vancouver BC area
  burnaby: "vancouver",
  surrey: "vancouver",
  richmond: "vancouver",
  // DC
  arlington: "washington",
  alexandria: "washington",
  // Tokyo metro
  yokohama: "tokyo",
  shibuya: "tokyo",
  shinjuku: "tokyo",
};

const FALLBACK =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80";

const HERO =
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1800&q=80";

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve a detected place to a metro hub with a curated photo. */
export function resolveHeroMetro(destination: string): {
  metro: string | null;
  imageUrl: string;
  caption: string | null;
  matched: boolean;
} {
  const key = destination.toLowerCase().trim();
  if (!key) {
    return { metro: null, imageUrl: HERO, caption: null, matched: false };
  }

  // Direct library hit
  const libEntries = Object.keys(LIBRARY).sort((a, b) => b.length - a.length);
  for (const city of libEntries) {
    if (key === city || key.includes(city)) {
      return {
        metro: city,
        imageUrl: LIBRARY[city],
        caption: titleCase(city),
        matched: true,
      };
    }
  }

  // Suburb → metro
  const aliasEntries = Object.entries(METRO_ALIASES).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [alias, metro] of aliasEntries) {
    if (key === alias || key.includes(alias)) {
      const url = LIBRARY[metro] ?? FALLBACK;
      return {
        metro,
        imageUrl: url,
        caption: `${titleCase(metro)} area`,
        matched: Boolean(LIBRARY[metro]),
      };
    }
  }

  return {
    metro: null,
    imageUrl: FALLBACK,
    caption: titleCase(destination),
    matched: false,
  };
}

export function destinationImageUrl(destination: string): string {
  return resolveHeroMetro(destination).imageUrl;
}

/** True when we have a curated photo for this place (including metro aliases). */
export function hasCuratedCityImage(destination: string): boolean {
  return resolveHeroMetro(destination).matched;
}

export function countryFromDestination(destination: string): string {
  const parts = destination.split(",").map((s) => s.trim());
  if (parts.length > 1) return parts[parts.length - 1];
  const key = destination.toLowerCase();
  if (key.includes("paris")) return "France";
  if (key.includes("tokyo") || key.includes("japan")) return "Japan";
  if (
    key.includes("new york") ||
    key.includes("seattle") ||
    key.includes("bellevue")
  )
    return "United States";
  if (key.includes("london")) return "United Kingdom";
  return "Destination";
}

export function dashboardHeroImage(cityHint?: string | null): string {
  if (cityHint) return destinationImageUrl(cityHint);
  return HERO;
}
