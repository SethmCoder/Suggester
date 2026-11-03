const GENERIC = new Set([
  "city",
  "town",
  "beach",
  "museum",
  "restaurant",
  "cafe",
  "coffee",
  "park",
  "view",
  "hidden gem",
  "must visit",
  "travel",
  "trip",
  "guide",
]);

const PLACE_PATTERNS = [
  /(?:visit|explore|discover|see)\s+(?:the\s+)?([A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){0,4})/g,
  /(?:best|top|famous|iconic|trending|hidden)\s+([a-z]+(?:\s+[a-z]+){0,3})\s+(?:in|of|at)\s+([A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){0,3})/gi,
  /([A-Z][\w''-]+(?:\s+[A-Z][\w''-]+){1,4})\s+(?:is trending|must-visit|must visit)/g,
];

function cleanName(name: string): string | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed.length < 4) return null;
  if (GENERIC.has(trimmed.toLowerCase())) return null;
  if (/^\d/.test(trimmed)) return null;
  return trimmed;
}

export function extractPlaceNamesFromText(
  text: string,
  destination: string,
): string[] {
  const found = new Set<string>();
  const destLower = destination.toLowerCase();

  for (const pattern of PLACE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.length === 2) {
        const n = cleanName(match[1]);
        if (n) found.add(n);
      } else if (match.length >= 3) {
        const phrase = cleanName(
          `${match[1]} ${match[2]}`.replace(/\b\w/g, (c) => c.toUpperCase()),
        );
        if (phrase) found.add(phrase);
      }
    }
  }

  const quoted = [...text.matchAll(/"([^"]{4,60})"/g)].map((m) => m[1]);
  for (const q of quoted) {
    const n = cleanName(q);
    if (n && (text.toLowerCase().includes(destLower) || q.length > 8)) {
      found.add(n);
    }
  }

  return [...found].slice(0, 12);
}
