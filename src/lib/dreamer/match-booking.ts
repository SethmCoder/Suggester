import type { ParsedBooking } from "./types";

export type MatchCandidate = {
  id: string;
  kind: "dream" | "trip";
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  cities?: string[];
  iatas?: string[];
  status?: string | null;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function overlapScore(hay: string, needles: string[]): number {
  const h = norm(hay);
  let score = 0;
  for (const n of needles) {
    const nn = norm(n);
    if (!nn) continue;
    if (h.includes(nn) || nn.includes(h)) score += 3;
    else {
      const parts = nn.split(" ").filter(Boolean);
      if (parts.some((p) => h.includes(p) && p.length > 2)) score += 1;
    }
  }
  return score;
}

function dateProximity(
  candidateStart: string | null | undefined,
  bookingStart: string | null | undefined,
): number {
  if (!candidateStart || !bookingStart) return 0;
  const a = Date.parse(`${candidateStart}T12:00:00`);
  const b = Date.parse(`${bookingStart}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const days = Math.abs(a - b) / 86_400_000;
  if (days <= 1) return 4;
  if (days <= 7) return 2;
  if (days <= 30) return 1;
  return 0;
}

/**
 * Score how well a parsed booking matches an owner's dream or trip.
 * Higher is better. Threshold for auto-attach is typically >= 3.
 */
export function scoreBookingMatch(
  parsed: ParsedBooking,
  candidate: MatchCandidate,
): number {
  const cities = [
    ...(parsed.cities ?? []),
    parsed.hotelName ?? "",
  ].filter(Boolean);
  const iatas = [parsed.fromIata, parsed.toIata].filter(Boolean) as string[];

  let score = 0;
  score += overlapScore(candidate.destination, cities);
  for (const c of candidate.cities ?? []) {
    score += overlapScore(c, cities);
  }
  for (const iata of iatas) {
    const list = candidate.iatas ?? [];
    if (list.some((x) => x.toUpperCase() === iata.toUpperCase())) score += 4;
    if (norm(candidate.destination).includes(norm(iata))) score += 2;
  }
  score += dateProximity(candidate.startDate, parsed.startDate ?? null);

  const status = candidate.status ?? "";
  if (["researching", "planning", "wishlist", "comparing"].includes(status)) {
    score += 1;
  }
  if (candidate.kind === "dream") score += 0.5;

  // Tokyo / HND heuristic: IATA city codes often appear in destination text weakly
  if (parsed.toIata && /tokyo|japan|hnd|nrt/i.test(candidate.destination)) {
    if (/hnd|nrt/i.test(parsed.toIata)) score += 2;
  }
  if (parsed.toIata && /egypt|cairo|cai/i.test(candidate.destination)) {
    if (/cai/i.test(parsed.toIata)) score += 2;
    if (/hnd|nrt|tokyo/i.test(parsed.toIata)) score -= 1;
  }

  return score;
}

export function pickBestMatch(
  parsed: ParsedBooking,
  candidates: MatchCandidate[],
  threshold = 3,
): { candidate: MatchCandidate; score: number } | null {
  let best: { candidate: MatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    const score = scoreBookingMatch(parsed, c);
    if (!best || score > best.score) best = { candidate: c, score };
  }
  if (!best || best.score < threshold) return null;
  return best;
}
