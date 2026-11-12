"use client";

/**
 * Demo sessions end only via explicit exit (Back to start, Create account,
 * or sign-in). Do not call /api/demo/end on pagehide/beforeunload — those
 * fire on normal hard navigations (materialize → trip, Future Trip detail)
 * and would wipe the demo cookie mid-flow.
 */
export function DemoSessionGuard() {
  return null;
}
