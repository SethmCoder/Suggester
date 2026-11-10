import type {
  IntelligenceSignal,
  TravelIntelligence,
  WeightedInterest,
} from "./types";
import { emptyIntelligence } from "./types";

const CATEGORY_TO_INTEREST: Record<string, string> = {
  museum: "museums",
  attraction: "culture",
  restaurant: "food",
  cafe: "food",
  outdoor: "nature",
  hotel: "culture",
  neighborhood: "culture",
  experience: "adventure",
  destination: "culture",
  architecture: "architecture",
  history: "history",
  aviation: "aviation",
  nightlife: "nightlife",
};

function bump(
  list: WeightedInterest[],
  interest: string,
  delta: number,
  source: WeightedInterest["source"] = "inferred",
): WeightedInterest[] {
  const now = new Date().toISOString();
  const existing = list.find((row) => row.interest === interest);
  if (!existing) {
    return [
      {
        interest,
        weight: Math.max(0.5, 1 + delta),
        source,
        evidence: 1,
        updatedAt: now,
      },
      ...list,
    ].slice(0, 24);
  }
  return list.map((row) =>
    row.interest === interest
      ? {
          ...row,
          weight: Math.min(3, Math.max(0.5, row.weight + delta)),
          evidence: row.evidence + 1,
          updatedAt: now,
          source: row.source === "explicit" ? "explicit" : source,
        }
      : row,
  );
}

export function applySignal(
  profile: TravelIntelligence,
  signal: IntelligenceSignal,
): TravelIntelligence {
  if (signal.type === "reset") {
    return {
      ...emptyIntelligence(),
      personalizationEnabled: profile.personalizationEnabled,
      updatedAt: new Date().toISOString(),
    };
  }
  if (signal.type === "toggle") {
    return { ...profile, personalizationEnabled: signal.enabled };
  }
  if (signal.type === "explicit_set") {
    return {
      ...profile,
      explicit: { ...profile.explicit, ...signal.patch },
    };
  }

  const next = { ...profile, inferred: { ...profile.inferred } };

  if (signal.type === "wishlist_save" || signal.type === "discover_save") {
    const category = signal.type === "wishlist_save" ? signal.category : null;
    const mapped =
      (category && CATEGORY_TO_INTEREST[category]) ||
      (signal.type === "discover_save" ? "culture" : null);
    if (mapped) {
      next.inferred.interests = bump(next.inferred.interests, mapped, 0.25);
    }
    for (const interest of signal.type === "discover_save" ? signal.interests ?? [] : []) {
      next.inferred.interests = bump(next.inferred.interests, interest, 0.2);
    }
    if (signal.type === "wishlist_save" && signal.location) {
      next.inferred.preferredDestinations = [
        signal.location,
        ...next.inferred.preferredDestinations.filter((item) => item !== signal.location),
      ].slice(0, 40);
    }
    if (signal.type === "discover_save") {
      next.inferred.preferredDestinations = [
        signal.destinationId,
        ...next.inferred.preferredDestinations.filter((item) => item !== signal.destinationId),
      ].slice(0, 40);
    }
  }

  if (signal.type === "wishlist_remove") {
    const mapped = signal.category && CATEGORY_TO_INTEREST[signal.category];
    if (mapped) {
      next.inferred.interests = bump(next.inferred.interests, mapped, -0.15);
    }
  }

  if (signal.type === "future_trip_create") {
    next.inferred.preferredDestinations = [
      signal.destination,
      ...next.inferred.preferredDestinations.filter((item) => item !== signal.destination),
    ].slice(0, 40);
    for (const interest of signal.interests ?? []) {
      next.inferred.interests = bump(next.inferred.interests, interest, 0.2);
    }
  }

  if (signal.type === "activity_keep") {
    for (const type of signal.types ?? []) {
      const mapped = CATEGORY_TO_INTEREST[type] || type;
      next.inferred.interests = bump(next.inferred.interests, mapped, 0.2);
    }
  }

  if (signal.type === "activity_dismiss") {
    for (const type of signal.types ?? []) {
      const mapped = CATEGORY_TO_INTEREST[type] || type;
      next.inferred.downrankedInterests = bump(
        next.inferred.downrankedInterests,
        mapped,
        0.35,
      );
      next.inferred.interests = bump(next.inferred.interests, mapped, -0.2);
    }
  }

  if (signal.type === "booking_confirmation") {
    // Prepend in reverse so the first listed city stays most recent.
    for (const city of [...(signal.cities ?? [])].reverse()) {
      next.inferred.preferredDestinations = [
        city,
        ...next.inferred.preferredDestinations.filter((item) => item !== city),
      ].slice(0, 40);
      next.inferred.previousDestinations = [
        city,
        ...next.inferred.previousDestinations.filter((item) => item !== city),
      ].slice(0, 40);
    }
    if (signal.kind === "flight") {
      next.inferred.interests = bump(next.inferred.interests, "aviation", 0.35);
    }
    if (signal.cabin && /business|first/i.test(signal.cabin)) {
      next.inferred.interests = bump(next.inferred.interests, "culture", 0.15);
    }
    if (signal.route) {
      next.explanations = [
        `Confirmation evidence: ${signal.route}.`,
        ...next.explanations.filter((line) => !line.startsWith("Confirmation evidence:")),
      ].slice(0, 8);
    }
  }

  return next;
}

export function buildExplanations(profile: TravelIntelligence): string[] {
  const lines: string[] = [];
  if (!profile.personalizationEnabled) {
    return ["Personalization is off. Only explicit Profile settings are used."];
  }
  if (profile.explicit.interests.length) {
    lines.push(
      `You set these interests: ${profile.explicit.interests.join(", ")}.`,
    );
  }
  const strong = profile.inferred.interests.filter(
    (row) => row.evidence >= 2 && row.weight >= 1.25,
  );
  if (strong.length) {
    lines.push(
      `Repeated saves suggest interest in ${strong
        .slice(0, 4)
        .map((row) => row.interest)
        .join(", ")} (${strong[0].evidence}+ signals).`,
    );
  }
  const down = profile.inferred.downrankedInterests.filter(
    (row) => row.evidence >= 2,
  );
  if (down.length) {
    lines.push(
      `Repeated dismissals lower priority for ${down
        .map((row) => row.interest)
        .slice(0, 3)
        .join(", ")}.`,
    );
  }
  if (profile.inferred.preferredDestinations.length) {
    lines.push(
      `Saved or planned destinations include ${profile.inferred.preferredDestinations
        .slice(0, 4)
        .join(", ")}.`,
    );
  }
  if (profile.explicit.budgetMax) {
    lines.push(`Your usual budget ceiling is about $${profile.explicit.budgetMax}.`);
  }
  if (profile.explicit.preferredDurationDays) {
    lines.push(
      `You usually plan about ${profile.explicit.preferredDurationDays} days.`,
    );
  }
  if (
    profile.explanations.some((line) => line.startsWith("Confirmation evidence:"))
  ) {
    lines.unshift(
      ...profile.explanations.filter((line) =>
        line.startsWith("Confirmation evidence:"),
      ),
    );
  }
  if (!lines.length) {
    lines.push(
      "No strong personalization yet. Paste a confirmation, save places, or set interests in Profile.",
    );
  }
  return lines.slice(0, 8);
}
