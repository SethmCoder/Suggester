import {
  accountlessFetch,
  cacheGet,
  cacheSet,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";
import type { DestinationContext } from "@/lib/places/types";

const CACHE_TTL_MS = 18 * 60 * 60 * 1000; // ~18h within 12–24h
const STATUS_URL = "https://sorted.travel/api/v1/status";
const MCP_URL = "https://sorted.travel/mcp";

async function mcpCall(
  method: string,
  params: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    const res = await accountlessFetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": waypointUserAgent(),
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: method, arguments: params },
      }),
      timeoutMs: 20000,
      retryOnce: false,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { content?: { type: string; text?: string }[] };
    };
    const text = data.result?.content?.find((c) => c.type === "text")?.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  } catch {
    return null;
  }
}

/**
 * Destination-level context only (not venue trending).
 * Zero-auth Sorted Travel tools; fails soft.
 */
export async function fetchSortedDestinationContext(
  destination: string,
): Promise<DestinationContext | null> {
  const key = `sorted:${destination.trim().toLowerCase()}`;
  const cached = cacheGet<DestinationContext>(key);
  if (cached) return cached;

  try {
    const statusRes = await accountlessFetch(STATUS_URL, {
      timeoutMs: 10000,
      retryOnce: false,
    });
    if (!statusRes.ok) return null;

    const resolved = (await mcpCall("resolve_destination", {
      query: destination,
    })) as { handle?: string; destination?: string } | null;

    const handle =
      resolved?.handle ||
      destination
        .split(",")[0]
        ?.trim()
        .toLowerCase()
        .replace(/\s+/g, "-") ||
      null;

    if (!handle) return null;

    const info = (await mcpCall("get_destination_info", {
      destination: handle,
    })) as Record<string, unknown> | null;

    let weatherSummary: string | null = null;
    const weather = (await mcpCall("get_destination_weather", {
      destination: handle,
    })) as Record<string, unknown> | null;
    if (weather) {
      const bits = [
        weather.summary,
        weather.current,
        weather.description,
      ].filter(Boolean);
      weatherSummary =
        bits.length > 0
          ? String(bits[0])
          : weather.text
            ? String(weather.text)
            : null;
    }

    const ctx: DestinationContext = {
      handle,
      brief:
        (info?.brief as string) ||
        (info?.description as string) ||
        (info?.summary as string) ||
        null,
      weatherSummary,
      safetyNote:
        (info?.safety as string) ||
        (info?.safety_note as string) ||
        null,
      currency: (info?.currency as string) || null,
      source: "sorted_travel",
      retrievedAt: new Date().toISOString(),
    };

    // Only cache if we got something useful
    if (ctx.brief || ctx.weatherSummary || ctx.currency) {
      cacheSet(key, ctx, CACHE_TTL_MS);
      return ctx;
    }
    return null;
  } catch {
    return null;
  }
}

export function formatDestinationContextForPrompt(
  ctx: DestinationContext | null,
): string {
  if (!ctx) return "";
  const parts = [
    ctx.brief ? `Brief: ${ctx.brief}` : null,
    ctx.weatherSummary ? `Weather: ${ctx.weatherSummary}` : null,
    ctx.safetyNote ? `Safety: ${ctx.safetyNote}` : null,
    ctx.currency ? `Currency: ${ctx.currency}` : null,
  ].filter(Boolean);
  if (!parts.length) return "";
  return `Destination context (Sorted Travel, destination-level only — not venue trending):\n${parts.join("\n")}`;
}
