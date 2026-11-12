import { DEMO_DUBAI_ID, DEMO_TRIP_ID } from "@/lib/demo/data";

const SNAPSHOT_PREFIX = "waypoint:offline-trip:";
const INDEX_KEY = "waypoint:offline-trips-index-v1";
const DREAMER_BOOKINGS_KEY = "waypoint:dreamer-bookings";
const WISHLIST_COLLECTIONS_KEY = "waypoint:wishlist-collections-v1";
const WISHLIST_ITEMS_KEY = "waypoint:wishlist-items-v1";
const WISHLIST_MIGRATED_KEY = "waypoint:wishlist-migrated-v1";

/** Keys and prefixes cleared when a demo session ends or the tab hides. */
export const DEMO_LOCAL_STORAGE_TARGETS = [
  INDEX_KEY,
  DREAMER_BOOKINGS_KEY,
  WISHLIST_COLLECTIONS_KEY,
  WISHLIST_ITEMS_KEY,
  WISHLIST_MIGRATED_KEY,
  `${SNAPSHOT_PREFIX}${DEMO_TRIP_ID}`,
  `${SNAPSHOT_PREFIX}${DEMO_DUBAI_ID}`,
] as const;

const DEMO_SNAPSHOT_PREFIX = `${SNAPSHOT_PREFIX}demo-`;

export function clearDemoLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    for (const key of DEMO_LOCAL_STORAGE_TARGETS) {
      localStorage.removeItem(key);
    }
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(DEMO_SNAPSHOT_PREFIX)) toRemove.push(key);
      if (key.startsWith("waypoint:dreamer-email:")) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}
