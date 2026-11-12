/**
 * Curated famous landmarks for major destinations.
 * These are stable, well-known tourist attractions with fixed coordinates.
 * Use `catalog:` placeId prefix to skip broken Nominatim detail lookups.
 *
 * Invent-nothing compliant: these are real, publicly known places.
 */

export type KnownLandmark = {
  id: string;
  displayName: string;
  /** Alternative names for matching user input */
  aliases: string[];
  lat: number;
  lng: number;
  /** Neighborhood cluster for day theming */
  cluster: string;
  types: string[];
  /** Typical visit duration in minutes */
  durationMinutes: number;
  /** Short planning note */
  note: string;
  /** Optional opening hours hint (not authoritative) */
  hoursHint?: string;
};

export type NeighborhoodCluster = {
  id: string;
  displayName: string;
  /** Center point for the cluster */
  lat: number;
  lng: number;
  /** Suggested day theme description */
  dayTheme: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// TOKYO LANDMARKS
// ─────────────────────────────────────────────────────────────────────────────

export const TOKYO_CLUSTERS: NeighborhoodCluster[] = [
  {
    id: "west",
    displayName: "Shinjuku, Harajuku & Shibuya",
    lat: 35.6595,
    lng: 139.7004,
    dayTheme:
      "West Tokyo: Meiji Shrine, Takeshita Street, Shibuya Crossing, then Shinjuku evening nightlife (Omoide Yokocho / Golden Gai)",
  },
  {
    id: "east",
    displayName: "Asakusa & Skytree",
    lat: 35.7117,
    lng: 139.7966,
    dayTheme: "East Tokyo: Senso-ji Temple, Nakamise shopping street, Tokyo Skytree",
  },
  {
    id: "central",
    displayName: "Imperial Palace, Ginza & Tokyo Tower",
    lat: 35.6762,
    lng: 139.7638,
    dayTheme: "Central Tokyo: Imperial Palace gardens, upscale Ginza shopping, Tokyo Tower views",
  },
  {
    id: "odaiba",
    displayName: "Odaiba & Tokyo Bay",
    lat: 35.6267,
    lng: 139.7750,
    dayTheme: "Waterfront Tokyo: TeamLab, Gundam statue, Rainbow Bridge views",
  },
];

export const TOKYO_LANDMARKS: KnownLandmark[] = [
  // ── East cluster: Asakusa / Ueno / Skytree (Traditional Tokyo - Day 1) ──
  // Order: Walk from Asakusa station → Kaminarimon → Nakamise → Senso-ji → walk to Ueno → Skytree
  {
    id: "sensoji",
    displayName: "Senso-ji Temple & Kaminarimon",
    aliases: ["sensoji", "asakusa temple", "asakusa kannon", "浅草寺", "金龍山", "kaminarimon", "雷門"],
    lat: 35.7148,
    lng: 139.7967,
    cluster: "east",
    types: ["attraction", "place_of_worship", "temple", "tourism"],
    durationMinutes: 60,
    note: "Tokyo's oldest temple. Enter via the iconic Kaminarimon ('Thunder Gate') with its giant red lantern.",
  },
  {
    id: "nakamise",
    displayName: "Nakamise Shopping Street",
    aliases: ["nakamise dori", "仲見世通り"],
    lat: 35.7126,
    lng: 139.7966,
    cluster: "east",
    types: ["attraction", "shopping", "street", "tourism"],
    durationMinutes: 40,
    note: "300m traditional shopping arcade to Senso-ji. Ningyo-yaki sweets, fans, and souvenirs.",
  },
  {
    id: "ueno-park",
    displayName: "Ueno Park & Ameyoko",
    aliases: ["ueno koen", "上野公園", "ameyoko", "アメ横"],
    lat: 35.7146,
    lng: 139.7745,
    cluster: "east",
    types: ["attraction", "park", "museum", "market", "tourism"],
    durationMinutes: 90,
    note: "Museums, shrines, and the nearby Ameyoko market street for street food and bargains.",
  },
  {
    id: "tokyo-skytree",
    displayName: "Tokyo Skytree",
    aliases: ["skytree", "東京スカイツリー"],
    lat: 35.7101,
    lng: 139.8107,
    cluster: "east",
    types: ["attraction", "viewpoint", "tower", "tourism"],
    durationMinutes: 90,
    note: "634m tower with two observation decks. Book Tembo Deck tickets in advance. Solamachi mall below.",
    hoursHint: "10:00-21:00",
  },
  {
    id: "sumida-park",
    displayName: "Sumida Park",
    aliases: ["隅田公園"],
    lat: 35.7122,
    lng: 139.8021,
    cluster: "east",
    types: ["attraction", "park", "tourism"],
    durationMinutes: 30,
    note: "Riverside park with views of Skytree. Walk along Sumida River between Asakusa and Skytree.",
  },

  // ── West cluster: Meiji / Harajuku / Shibuya / Shinjuku (Modern Tokyo - Day 4) ──
  // Order: Meiji (morning) → Takeshita → Shibuya Crossing → Shinjuku nightlife evening
  // Nightlife sits before Shibuya Sky / gardens so a 4-stop balanced day still includes it.
  {
    id: "meiji-jingu",
    displayName: "Meiji Jingu Shrine",
    aliases: ["meiji shrine", "meiji jingu", "明治神宮"],
    lat: 35.6764,
    lng: 139.6993,
    cluster: "west",
    types: ["attraction", "place_of_worship", "shrine", "tourism"],
    durationMinutes: 75,
    note: "Serene Shinto shrine in a 170-acre forest. Best visited early morning. Walk through the towering torii gates.",
  },
  {
    id: "takeshita-street",
    displayName: "Takeshita Street (Harajuku)",
    aliases: ["takeshita dori", "harajuku street", "竹下通り"],
    lat: 35.6702,
    lng: 139.7027,
    cluster: "west",
    types: ["attraction", "shopping", "street", "tourism"],
    durationMinutes: 50,
    note: "Harajuku's colorful pedestrian lane. Crepes, kawaii fashion, and people-watching. Just south of Meiji Shrine.",
  },
  {
    id: "shibuya-crossing",
    displayName: "Shibuya Crossing & Hachiko",
    aliases: ["shibuya scramble", "渋谷スクランブル交差点", "hachiko", "ハチ公"],
    lat: 35.6595,
    lng: 139.7004,
    cluster: "west",
    types: ["attraction", "landmark", "tourism"],
    durationMinutes: 40,
    note: "World's busiest pedestrian crossing. See Hachiko statue outside the station. Best viewed from Starbucks or Shibuya Sky.",
  },
  {
    id: "omoide-yokocho",
    displayName: "Omoide Yokocho",
    aliases: ["omoide yokocho", "思い出横丁", "piss alley", "memory lane shinjuku"],
    lat: 35.6933,
    lng: 139.6994,
    cluster: "west",
    types: ["attraction", "food", "nightlife", "evening", "shinjuku", "tourism"],
    durationMinutes: 60,
    note: "Narrow yakitori alleys by Shinjuku station's west side. Best after dark — guidance only, hours vary by stall.",
  },
  {
    id: "golden-gai",
    displayName: "Golden Gai",
    aliases: ["golden gai", "ゴールデン街", "golden gai shinjuku"],
    lat: 35.6939,
    lng: 139.7045,
    cluster: "west",
    types: ["attraction", "nightlife", "bar", "evening", "shinjuku", "tourism"],
    durationMinutes: 60,
    note: "Tiny multi-story bar lanes in Shinjuku. Many cover charges; best as an evening wander after Omoide Yokocho.",
  },
  {
    id: "shibuya-sky",
    displayName: "Shibuya Sky",
    aliases: ["shibuya scramble square", "渋谷スカイ"],
    lat: 35.6584,
    lng: 139.7022,
    cluster: "west",
    types: ["attraction", "viewpoint", "tourism"],
    durationMinutes: 60,
    note: "Open-air observation deck (230m) atop Shibuya Scramble Square. Book sunset slots in advance.",
    hoursHint: "10:00-22:30",
  },
  {
    id: "shinjuku-gyoen",
    displayName: "Shinjuku Gyoen Garden",
    aliases: ["shinjuku garden", "新宿御苑"],
    lat: 35.6852,
    lng: 139.7100,
    cluster: "west",
    types: ["attraction", "park", "garden", "tourism"],
    durationMinutes: 75,
    note: "Expansive garden with Japanese, French, and English sections. No alcohol allowed.",
    hoursHint: "09:00-16:30",
  },
  {
    id: "tokyo-metro-gov",
    displayName: "Tokyo Metropolitan Government Building",
    aliases: ["tokyo city hall", "tochomae", "都庁"],
    lat: 35.6896,
    lng: 139.6917,
    cluster: "west",
    types: ["attraction", "viewpoint", "government", "tourism"],
    durationMinutes: 40,
    note: "FREE observation decks on the 45th floor with panoramic views. North tower is best.",
    hoursHint: "09:30-22:00",
  },

  // ── Central cluster: Tsukiji / Imperial Palace / Ginza (Day 5) ──
  // Order: Tsukiji breakfast → Hamarikyu or Imperial Gardens → Ginza afternoon
  {
    id: "tsukiji-outer",
    displayName: "Tsukiji Outer Market",
    aliases: ["tsukiji market", "築地場外市場"],
    lat: 35.6654,
    lng: 139.7707,
    cluster: "central",
    types: ["attraction", "market", "food", "tourism"],
    durationMinutes: 90,
    note: "Start early! Fresh sushi, tamagoyaki, and seafood. Inner market moved to Toyosu but outer market thrives.",
    hoursHint: "05:00-14:00",
  },
  {
    id: "hamarikyu",
    displayName: "Hamarikyu Gardens",
    aliases: ["hamarikyu", "浜離宮恩賜庭園"],
    lat: 35.6597,
    lng: 139.7634,
    cluster: "central",
    types: ["attraction", "park", "garden", "historic", "tourism"],
    durationMinutes: 60,
    note: "Edo-period garden with a teahouse on a tidal pond. Walk from Tsukiji. Matcha with views.",
    hoursHint: "09:00-17:00",
  },
  {
    id: "imperial-palace-east",
    displayName: "Imperial Palace East Gardens",
    aliases: ["imperial palace", "kokyo", "皇居東御苑", "皇居"],
    lat: 35.6852,
    lng: 139.7528,
    cluster: "central",
    types: ["attraction", "park", "garden", "historic", "tourism"],
    durationMinutes: 75,
    note: "Free gardens on former Edo Castle grounds. Moats, stone walls, and seasonal flowers. Closed Mon/Fri.",
    hoursHint: "09:00-16:30",
  },
  {
    id: "ginza",
    displayName: "Ginza",
    aliases: ["ginza district", "銀座"],
    lat: 35.6721,
    lng: 139.7636,
    cluster: "central",
    types: ["attraction", "shopping", "neighbourhood", "tourism"],
    durationMinutes: 90,
    note: "Tokyo's upscale shopping district. Flagship stores, department stores, and galleries. Chuo-dori is pedestrianized on weekends.",
  },
  {
    id: "tokyo-tower",
    displayName: "Tokyo Tower",
    aliases: ["東京タワー"],
    lat: 35.6586,
    lng: 139.7454,
    cluster: "central",
    types: ["attraction", "viewpoint", "tower", "tourism"],
    durationMinutes: 60,
    note: "Iconic 1958 red-and-white tower. Classic Tokyo landmark, especially beautiful at night.",
    hoursHint: "09:00-22:30",
  },
  {
    id: "nihonbashi",
    displayName: "Nihonbashi",
    aliases: ["日本橋"],
    lat: 35.6839,
    lng: 139.7744,
    cluster: "central",
    types: ["attraction", "historic", "bridge", "tourism"],
    durationMinutes: 30,
    note: "Historic bridge and merchant district, the traditional 'kilometer zero' of Tokyo.",
  },

  // ── Odaiba cluster (optional/bonus) ──
  {
    id: "teamlab-planets",
    displayName: "teamLab Planets Tokyo",
    aliases: ["teamlab", "チームラボ"],
    lat: 35.6499,
    lng: 139.7895,
    cluster: "odaiba",
    types: ["attraction", "museum", "art", "tourism"],
    durationMinutes: 90,
    note: "Immersive digital art museum. Walk barefoot through water and projections. Book in advance.",
    hoursHint: "09:00-22:00",
  },
  {
    id: "odaiba-gundam",
    displayName: "Unicorn Gundam Statue",
    aliases: ["gundam", "ガンダム"],
    lat: 35.6250,
    lng: 139.7750,
    cluster: "odaiba",
    types: ["attraction", "monument", "tourism"],
    durationMinutes: 30,
    note: "Life-size 19.7m Gundam outside DiverCity. Transforms on schedule (check times).",
  },
  {
    id: "odaiba-seaside",
    displayName: "Odaiba Seaside Park",
    aliases: ["odaiba beach", "お台場海浜公園"],
    lat: 35.6268,
    lng: 139.7716,
    cluster: "odaiba",
    types: ["attraction", "park", "beach", "tourism"],
    durationMinutes: 45,
    note: "Artificial beach with Rainbow Bridge and city skyline views.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DISNEY PARK NOTES (for enriched planning notes)
// ─────────────────────────────────────────────────────────────────────────────

export const DISNEY_PARK_NOTES: Record<
  string,
  { 
    lands: string[]; 
    mustRide: string[]; 
    tips: string[];
    entertainment: string[];
  }
> = {
  "tokyo-disneyland": {
    lands: [
      "World Bazaar (entrance)",
      "Adventureland",
      "Westernland",
      "Critter Country",
      "Fantasyland (Beauty and the Beast area)",
      "Toontown",
      "Tomorrowland",
    ],
    mustRide: [
      "Enchanted Tale of Beauty and the Beast (Fantasyland) — book Premier Access or Standby Pass",
      "Pooh's Hunny Hunt — trackless ride, long lines",
      "Big Thunder Mountain — classic coaster",
      "Space Mountain — indoor coaster",
      "Splash Mountain — log flume, you will get wet",
      "Haunted Mansion — slow-moving dark ride",
      "Pirates of the Caribbean",
    ],
    tips: [
      "Arrive 30-45 min before rope drop for a head start",
      "Use the Tokyo Disney Resort app for Standby Pass and wait times",
      "Premier Access ($) lets you skip lines for top attractions",
      "Confirm park hours on the official calendar before your visit",
      "World Bazaar is covered — good refuge if it rains",
    ],
    entertainment: [
      "Disney Harmony in Color parade (daytime)",
      "Tokyo Disneyland Electrical Parade Dreamlights (evening)",
      "Nighttime fireworks (schedule varies)",
    ],
  },
  "tokyo-disneysea": {
    lands: [
      "Mediterranean Harbor (entrance)",
      "American Waterfront",
      "Port Discovery",
      "Lost River Delta",
      "Arabian Coast",
      "Mermaid Lagoon",
      "Mysterious Island",
      "Fantasy Springs (newest — Frozen, Tangled, Peter Pan)",
    ],
    mustRide: [
      "Fantasy Springs attractions — Anna and Elsa's Frozen Journey, Rapunzel's Lantern Festival, Peter Pan's Never Land Adventure (need Standby Pass or Premier Access)",
      "Journey to the Center of the Earth — volcano coaster, top thrill ride",
      "Tower of Terror — drop tower with a twist",
      "Soaring: Fantastic Flight — hang glider simulator",
      "Toy Story Mania! — interactive shooter",
      "Indiana Jones Adventure — jeep ride",
      "20,000 Leagues Under the Sea — submarine dark ride",
    ],
    tips: [
      "DisneySea is more adult-friendly and has better theming/food",
      "Fantasy Springs requires Standby Pass or Premier Access — secure these at park open",
      "Rope drop: head straight to Mysterious Island or Fantasy Springs",
      "Evening is magical — stay for Believe! Sea of Dreams harbor show",
      "Alcohol is sold here (unlike Disneyland) — try a cocktail at Teddy Roosevelt Lounge",
    ],
    entertainment: [
      "Believe! Sea of Dreams (nighttime harbor show)",
      "Character greetings at Mediterranean Harbor",
      "Live music and shows throughout",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const TOKYO_CITY_HINTS = [
  "tokyo",
  "東京",
  "shinjuku",
  "shibuya",
  "asakusa",
  "ginza",
  "ueno",
  "akihabara",
  "harajuku",
  "roppongi",
];

export function isTokyo(destination: string): boolean {
  const lower = destination.toLowerCase();
  return TOKYO_CITY_HINTS.some((hint) => lower.includes(hint));
}

export function catalogPlaceId(landmark: KnownLandmark): string {
  return `catalog:${landmark.id}`;
}

export function matchLandmarkByName(
  name: string,
  landmarks: KnownLandmark[],
): KnownLandmark | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  for (const lm of landmarks) {
    if (lm.displayName.toLowerCase().includes(needle)) return lm;
    if (needle.includes(lm.displayName.toLowerCase())) return lm;
    for (const alias of lm.aliases) {
      if (alias.includes(needle) || needle.includes(alias)) return lm;
    }
  }
  return null;
}

export function landmarkAsHit(lm: KnownLandmark, city: string) {
  return {
    placeId: catalogPlaceId(lm),
    displayName: lm.displayName,
    lat: lm.lat,
    lng: lm.lng,
    types: lm.types,
    formattedAddress: city,
    openingHours: lm.hoursHint,
  };
}

/**
 * Get curated landmarks for a destination.
 * Currently only Tokyo is seeded; returns empty for other cities.
 */
export function getLandmarksForDestination(destination: string): KnownLandmark[] {
  if (isTokyo(destination)) {
    return TOKYO_LANDMARKS;
  }
  return [];
}

/**
 * Get neighborhood clusters for a destination.
 */
export function getClustersForDestination(
  destination: string,
): NeighborhoodCluster[] {
  if (isTokyo(destination)) {
    return TOKYO_CLUSTERS;
  }
  return [];
}

/**
 * Assign non-park days to neighborhood clusters for variety.
 * Returns a map of dayIndex -> cluster.
 * 
 * Pattern (matching typical Tokyo itineraries like Grok/ChatGPT):
 * - Day 1: East (traditional) — Asakusa, Senso-ji, Skytree
 * - Day 4: West (modern) — Meiji, Harajuku, Shibuya, Shinjuku nightlife (Omoide / Golden Gai)
 * - Day 5: Central — Tsukiji, Imperial Palace, Ginza
 */
export function assignDayClusters(
  dayCount: number,
  parkDays: Set<number>,
  destination: string,
): Map<number, NeighborhoodCluster> {
  const clusters = getClustersForDestination(destination);
  if (!clusters.length) return new Map();

  const result = new Map<number, NeighborhoodCluster>();
  const freeDays: number[] = [];
  for (let i = 0; i < dayCount; i++) {
    if (!parkDays.has(i)) freeDays.push(i);
  }

  // Order: east (traditional) first, then west (modern), then central
  // This matches quality itineraries that start with historic Tokyo
  const clusterOrder = clusters.slice().sort((a, b) => {
    const order: Record<string, number> = { east: 0, west: 1, central: 2, odaiba: 3 };
    return (order[a.id] ?? 99) - (order[b.id] ?? 99);
  });

  for (let i = 0; i < freeDays.length; i++) {
    const cluster = clusterOrder[i % clusterOrder.length];
    if (cluster) {
      result.set(freeDays[i], cluster);
    }
  }

  return result;
}

/**
 * Get landmarks for a specific cluster.
 */
export function getLandmarksForCluster(
  cluster: NeighborhoodCluster,
  destination: string,
): KnownLandmark[] {
  const all = getLandmarksForDestination(destination);
  return all.filter((lm) => lm.cluster === cluster.id);
}

/**
 * Build enriched planning note for a Disney park day.
 */
export function enrichedParkNote(parkId: string, displayName: string): string {
  const info = DISNEY_PARK_NOTES[parkId];
  if (!info) {
    return `Full park day at ${displayName}. Confirm hours before you go.`;
  }

  const lines = [
    `**Full day at ${displayName}**`,
    "",
    `**Lands:** ${info.lands.join(" → ")}`,
    "",
    "**Must-ride attractions:**",
    ...info.mustRide.slice(0, 5).map(r => `• ${r}`),
    "",
    "**Planning tips:**",
    ...info.tips.slice(0, 4).map(t => `• ${t}`),
    "",
    `**Entertainment:** ${info.entertainment.join("; ")}`,
  ];

  return lines.join("\n");
}
