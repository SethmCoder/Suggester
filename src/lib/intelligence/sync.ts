import type { IntelligenceSignal, TravelIntelligence } from "./types";
import {
  readIntelligence,
  recordIntelligenceSignal,
  replaceIntelligence,
} from "./store";

export async function loadIntelligence(): Promise<{
  profile: TravelIntelligence;
  source: "remote" | "local";
}> {
  const local = readIntelligence();
  try {
    const res = await fetch("/api/intelligence");
    if (!res.ok) return { profile: local, source: "local" };
    const data = (await res.json()) as {
      offline?: boolean;
      profile?: TravelIntelligence;
    };
    if (data.offline || !data.profile) return { profile: local, source: "local" };
    // Prefer remote explicit fields; keep richer local inferred evidence when remote is empty.
    const merged: TravelIntelligence = {
      ...local,
      ...data.profile,
      explicit: { ...local.explicit, ...data.profile.explicit },
      inferred: {
        interests:
          data.profile.inferred.interests.length > local.inferred.interests.length
            ? data.profile.inferred.interests
            : local.inferred.interests,
        preferredDestinations: [
          ...new Set([
            ...data.profile.inferred.preferredDestinations,
            ...local.inferred.preferredDestinations,
          ]),
        ].slice(0, 40),
        previousDestinations: [
          ...new Set([
            ...data.profile.inferred.previousDestinations,
            ...local.inferred.previousDestinations,
          ]),
        ].slice(0, 40),
        downrankedInterests:
          data.profile.inferred.downrankedInterests.length >
          local.inferred.downrankedInterests.length
            ? data.profile.inferred.downrankedInterests
            : local.inferred.downrankedInterests,
      },
      personalizationEnabled: data.profile.personalizationEnabled,
    };
    replaceIntelligence(merged);
    return { profile: merged, source: "remote" };
  } catch {
    return { profile: local, source: "local" };
  }
}

export async function saveIntelligence(profile: TravelIntelligence) {
  replaceIntelligence(profile);
  try {
    await fetch("/api/intelligence", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
  } catch {
    /* local already saved */
  }
}

export async function postIntelligenceSignal(signal: IntelligenceSignal) {
  const local = recordIntelligenceSignal(signal);
  try {
    await fetch("/api/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal }),
    });
  } catch {
    /* local already updated */
  }
  return local;
}
