"use client";

import type { AnalyticsEventName } from "./events";

/** Fire-and-forget client analytics (requires signed-in session). */
export function trackClientEvent(
  event: AnalyticsEventName,
  properties?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      properties,
      path: window.location.pathname,
    }),
  }).catch(() => null);
}
