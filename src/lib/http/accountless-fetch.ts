/**
 * Shared fetch for free/accountless providers: timeout, one retry with backoff,
 * respect Retry-After / RateLimit headers. Never falls back to paid APIs.
 */

const UA =
  "WaypointItinerary/1.0 (travel planner; contact: local-dev; +https://github.com)";

let active = 0;
const MAX_CONCURRENT = 3;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release() {
  active -= 1;
  const next = queue.shift();
  if (next) next();
}

export async function accountlessFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number; retryOnce?: boolean },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 20000;
  const retryOnce = init?.retryOnce !== false;
  await acquire();
  try {
    const res = await doFetch(url, init, timeoutMs);
    if (
      retryOnce &&
      (res.status === 429 || res.status === 503 || res.status >= 500)
    ) {
      const retryAfter = Number(res.headers.get("Retry-After") || "2");
      const waitMs = Number.isFinite(retryAfter)
        ? Math.min(15_000, Math.max(500, retryAfter * 1000))
        : 2000;
      await sleep(waitMs);
      return doFetch(url, init, timeoutMs);
    }
    return res;
  } finally {
    release();
  }
}

async function doFetch(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", UA);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function waypointUserAgent() {
  return UA;
}

/** Simple in-memory TTL cache shared by accountless services. */
const mem = new Map<string, { expires: number; value: unknown }>();

export function cacheGet<T>(key: string): T | null {
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    mem.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  mem.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheClearForTests() {
  mem.clear();
}
