import { getPopularityConfig } from "../config/popularity";
import { scoreMentionAggregate } from "./score";
import type {
  PlaceMentionAggregate,
  PopularitySignals,
  RawMention,
} from "./types";
import { fetchTravelFeedMentions } from "./providers/travel-feeds";
import { fetchSerpTrendMentions } from "./providers/serp-trends";
import {
  fetchInstagramMentions,
  fetchTikTokMentions,
} from "./providers/social-stubs";
import {
  getCachedPopularity,
  upsertPopularityCache,
} from "./cache";
import { resolvePlaceForMention } from "./match-places";
import { logger } from "../logger";

function aggregateByName(
  destination: string,
  mentions: RawMention[],
  names: string[],
): PlaceMentionAggregate[] {
  const map = new Map<string, RawMention[]>();

  for (const name of names) {
    map.set(name.toLowerCase(), []);
  }

  for (const m of mentions) {
    const text = `${m.title} ${m.snippet}`.toLowerCase();
    for (const name of names) {
      if (text.includes(name.toLowerCase())) {
        map.get(name.toLowerCase())!.push(m);
      }
    }
  }

  return names.map((normalizedName) => {
    const list = map.get(normalizedName.toLowerCase()) ?? [];
    return {
      normalizedName,
      destinationHint: destination,
      mentions: list,
      sourceCount: new Set(list.map((x) => x.source)).size,
    };
  });
}

export async function getPopularityForDestination(input: {
  destination: string;
  destinationLat: number;
  destinationLng: number;
  radiusKm?: number;
  seedPlaceIds?: string[];
}): Promise<Map<string, PopularitySignals>> {
  const config = getPopularityConfig();
  const result = new Map<string, PopularitySignals>();
  if (!config.enabled) return result;

  const cached = await getCachedPopularity(
    input.destination,
    config.cacheTtlHours,
  );
  if (cached) {
    for (const row of cached) {
      if (row.placeId) result.set(row.placeId, row);
    }
    return result;
  }

  const providers = config.providers;
  const mentions: RawMention[] = [];
  let extractedNames: string[] = [];

  try {
    if (providers.includes("travel_feeds")) {
      const feed = await fetchTravelFeedMentions(input.destination);
      mentions.push(...feed.mentions.slice(0, config.maxMentionsPerRefresh));
      extractedNames.push(...feed.extractedNames);
    }
    if (providers.includes("serp_trends") && extractedNames.length) {
      mentions.push(
        ...(await fetchSerpTrendMentions(input.destination, extractedNames)),
      );
    }
    await fetchInstagramMentions(input.destination, [
      input.destination.replace(/\s+/g, ""),
    ]).then((m) => mentions.push(...m));
    await fetchTikTokMentions(input.destination).then((m) => mentions.push(...m));
  } catch (err) {
    logger.warn("popularity_fetch_partial_failure", {
      destination: input.destination,
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  extractedNames = [...new Set(extractedNames)].slice(0, 40);
  const aggregates = aggregateByName(input.destination, mentions, extractedNames);

  const scored: PopularitySignals[] = [];
  for (const agg of aggregates) {
    if (agg.mentions.length === 0) continue;
    const resolved = await resolvePlaceForMention({
      name: agg.normalizedName,
      destination: input.destination,
      centerLat: input.destinationLat,
      centerLng: input.destinationLng,
      radiusKm: input.radiusKm ?? 50,
    });
    if (!resolved) continue;
    const signals = scoreMentionAggregate(agg, resolved.placeId);
    if (signals.confidence < config.minConfidence) continue;
    signals.displayName = resolved.displayName;
    signals.placeId = resolved.placeId;
    scored.push(signals);
    result.set(resolved.placeId, signals);
  }

  if (scored.length) {
    await upsertPopularityCache(input.destination, scored);
  }

  return result;
}
