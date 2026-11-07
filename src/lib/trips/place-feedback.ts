const KEY = "waypoint:place-feedback";

export type PlaceFeedback = { removed: string[]; added: string[] };

function empty(): PlaceFeedback {
  return { removed: [], added: [] };
}

export function readPlaceFeedback(): PlaceFeedback {
  if (typeof localStorage === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<PlaceFeedback>;
    return {
      removed: Array.isArray(parsed.removed) ? parsed.removed.filter((id) => typeof id === "string").slice(0, 40) : [],
      added: Array.isArray(parsed.added) ? parsed.added.filter((id) => typeof id === "string").slice(0, 40) : [],
    };
  } catch {
    return empty();
  }
}

function write(next: PlaceFeedback) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function rememberRemovedPlace(id: string | null | undefined) {
  const value = id?.trim();
  if (!value || typeof localStorage === "undefined") return;
  const current = readPlaceFeedback();
  write({
    removed: [value, ...current.removed.filter((item) => item !== value)].slice(0, 40),
    added: current.added.filter((item) => item !== value),
  });
  // Soft signal once per remove — evidence still needs repeats before it steers ranking.
  void import("@/lib/intelligence/sync")
    .then(({ postIntelligenceSignal }) =>
      postIntelligenceSignal({
        type: "activity_dismiss",
        name: value,
        types: /night|bar|club|casino/i.test(value) ? ["nightlife"] : ["attraction"],
      }),
    )
    .catch(() => undefined);
}

export function rememberAddedPlace(id: string | null | undefined) {
  const value = id?.trim();
  if (!value || typeof localStorage === "undefined") return;
  const current = readPlaceFeedback();
  write({
    added: [value, ...current.added.filter((item) => item !== value)].slice(0, 40),
    removed: current.removed.filter((item) => item !== value),
  });
  void import("@/lib/intelligence/sync")
    .then(({ postIntelligenceSignal }) =>
      postIntelligenceSignal({
        type: "activity_keep",
        name: value,
        types: ["attraction"],
      }),
    )
    .catch(() => undefined);
}
