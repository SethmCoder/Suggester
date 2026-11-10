/** Curated Unsplash CDN URLs keyed by metro hub (no API key; not stored in DB). */
const LIBRARY: Record<string, string> = {
  seattle:
    "https://images.unsplash.com/photo-1502175353174-a7a70e73b362?auto=format&fit=crop&w=1800&q=80",
  portland:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1600&q=80",
  "san francisco":
    "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1600&q=80",
  "los angeles":
    "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?auto=format&fit=crop&w=1600&q=80",
  chicago:
    "https://images.unsplash.com/photo-1494522358652-f30e61a60313?auto=format&fit=crop&w=1600&q=80",
  boston:
    "https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?auto=format&fit=crop&w=1600&q=80",
  miami:
    "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?auto=format&fit=crop&w=1600&q=80",
  denver:
    "https://images.unsplash.com/photo-1546156929-a4c0ac411f47?auto=format&fit=crop&w=1600&q=80",
  austin:
    "https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=1600&q=80",
  vancouver:
    "https://images.unsplash.com/photo-1559511260-66a654ae982a?auto=format&fit=crop&w=1600&q=80",
  montreal:
    "https://images.unsplash.com/photo-1519178614-68673b201f36?auto=format&fit=crop&w=1600&q=80",
  paris:
    "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=1600&q=80",
  tokyo:
    "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1800&q=80",
  kyoto:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80",
  osaka:
    "https://images.unsplash.com/photo-1590559899731-a382839e5549?auto=format&fit=crop&w=1600&q=80",
  kanazawa:
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=1600&q=80",
  japan:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80",
  fuji:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80",
  "new york":
    "https://images.unsplash.com/photo-1485871981521-5b1fd3805ebe?auto=format&fit=crop&w=1600&q=80",
  london:
    "https://images.unsplash.com/photo-1529655683826-aba9b3e77383?auto=format&fit=crop&w=1600&q=80",
  edinburgh:
    "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1600&q=80",
  rome:
    "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1600&q=80",
  madrid:
    "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1600&q=80",
  bangkok:
    "https://images.unsplash.com/photo-1563492065599-3520f7375d3b?auto=format&fit=crop&w=1600&q=80",
  toronto:
    "https://images.unsplash.com/photo-1517090504586-fde984fc2862?auto=format&fit=crop&w=1600&q=80",
  cairo:
    "https://images.unsplash.com/photo-1572252009286-268acec5ca0a?auto=format&fit=crop&w=1600&q=80",
  florence:
    "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=1600&q=80",
  bali:
    "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
  barcelona:
    "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80",
  valencia:
    "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?auto=format&fit=crop&w=1600&q=80",
  lisbon:
    "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?auto=format&fit=crop&w=1600&q=80",
  porto:
    "https://images.unsplash.com/photo-1558642084-fd07fae5282e?auto=format&fit=crop&w=1600&q=80",
  sydney:
    "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1600&q=80",
  melbourne:
    "https://images.unsplash.com/photo-1514395462725-fb4566210144?auto=format&fit=crop&w=1600&q=80",
  singapore:
    "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1600&q=80",
  seoul:
    "https://images.unsplash.com/photo-1538485399081-7191377e8241?auto=format&fit=crop&w=1600&q=80",
  taipei:
    "https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=1600&q=80",
  berlin:
    "https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=1600&q=80",
  amsterdam:
    "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1600&q=80",
  prague:
    "https://images.unsplash.com/photo-1541849546-216549ae216d?auto=format&fit=crop&w=1600&q=80",
  vienna:
    "https://images.unsplash.com/photo-1516550893923-42d28e5677af?auto=format&fit=crop&w=1600&q=80",
  budapest:
    "https://images.unsplash.com/photo-1520175480921-4edfa2983e0f?auto=format&fit=crop&w=1600&q=80",
  krakow:
    "https://images.unsplash.com/photo-1551867633-194f125bddfa?auto=format&fit=crop&w=1600&q=80",
  kraków:
    "https://images.unsplash.com/photo-1551867633-194f125bddfa?auto=format&fit=crop&w=1600&q=80",
  athens:
    "https://images.unsplash.com/photo-1555993539-1732b0258235?auto=format&fit=crop&w=1600&q=80",
  istanbul:
    "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1600&q=80",
  washington:
    "https://images.unsplash.com/photo-1617581629397-a72507c3de9e?auto=format&fit=crop&w=1600&q=80",
  dubai:
    "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1800&q=80",
  "abu dhabi":
    "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1800&q=80",
  "mexico city":
    "https://images.unsplash.com/photo-1512813195386-6cf811ad3542?auto=format&fit=crop&w=1600&q=80",
  lima:
    "https://images.unsplash.com/photo-1531968455001-5c5272a41129?auto=format&fit=crop&w=1600&q=80",
  "cape town":
    "https://images.unsplash.com/photo-1576485375217-d6a95e34d043?auto=format&fit=crop&w=1600&q=80",
  marrakesh:
    "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?auto=format&fit=crop&w=1600&q=80",
  reykjavik:
    "https://images.unsplash.com/photo-1476611338391-6f395a0ebc7b?auto=format&fit=crop&w=1600&q=80",
  reykjavík:
    "https://images.unsplash.com/photo-1476611338391-6f395a0ebc7b?auto=format&fit=crop&w=1600&q=80",
  bergen:
    "https://images.unsplash.com/photo-1601581875309-fafbf2d3ed3a?auto=format&fit=crop&w=1600&q=80",
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
  shoreline: "seattle",
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
  // Mexico City
  cdmx: "mexico city",
  "ciudad de mexico": "mexico city",
};

/**
 * Diverse place/landscape photos — never the travel-desk flatlay
 * (camera / notebook / pencil / bag) that used to be the single fallback.
 * Picked stably from the destination name so cards stay consistent.
 */
const FALLBACK_POOL = [
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80", // road trip overlook
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=80", // lake mountains
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80", // beach
  "https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=1600&q=80", // airplane window city
  "https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=1600&q=80", // mountain trail
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80", // desert dunes
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80", // alpine lake
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=80", // foggy hills
  "https://images.unsplash.com/photo-1519904981063-b0cf448d479e?auto=format&fit=crop&w=1600&q=80", // coastal cliffs
  "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1600&q=80", // city skyline dusk
  "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1600&q=80", // night city lights
  "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1600&q=80", // mountain reflection
] as const;

/** Old single fallback (travel flatlay) — kept only so tests can assert we no longer use it. */
export const LEGACY_TRAVEL_FLATLAY =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80";

const HERO =
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1800&q=80";

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function hashDestination(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function fallbackImageFor(destination: string): string {
  const key = destination.toLowerCase().trim() || "travel";
  return FALLBACK_POOL[hashDestination(key) % FALLBACK_POOL.length];
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
      const url = LIBRARY[metro] ?? fallbackImageFor(destination);
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
    imageUrl: fallbackImageFor(destination),
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
  if (key.includes("tokyo") || key.includes("japan") || key.includes("kyoto"))
    return "Japan";
  if (key.includes("dubai") || key.includes("abu dhabi") || key.includes("uae"))
    return "United Arab Emirates";
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
