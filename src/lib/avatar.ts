export const AVATAR_STORAGE_KEY = "waypoint:avatarDataUrl";
export const AVATAR_STORAGE_PREFIX = "waypoint:avatarDataUrl:";
export const DEMO_AVATAR_USER_ID = "demo";

export function avatarStorageKey(userId?: string | null): string {
  if (!userId) return AVATAR_STORAGE_KEY;
  return `${AVATAR_STORAGE_PREFIX}${userId}`;
}

export function avatarInitial(
  displayName?: string | null,
  email?: string | null,
  fallback = "M",
): string {
  const source = (displayName || email || fallback).trim();
  const letter = source.charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(letter) ? letter : fallback;
}

/** SVG data URL for the solid blue letter avatar (matches the header mark). */
export function letterAvatarDataUrl(letter: string): string {
  const initial = avatarInitial(letter, null, "M");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="#0400FF"/>
  <text x="64" y="64" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="64" font-weight="700" fill="#FFFFFF">${initial}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function migrateLegacyAvatar(userId?: string | null) {
  if (!userId || typeof window === "undefined") return;
  try {
    const legacy = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (!legacy) return;
    const key = avatarStorageKey(userId);
    if (!localStorage.getItem(key)) localStorage.setItem(key, legacy);
    localStorage.removeItem(AVATAR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readStoredAvatar(userId?: string | null): string | null {
  try {
    migrateLegacyAvatar(userId);
    if (userId) return localStorage.getItem(avatarStorageKey(userId));
    return localStorage.getItem(AVATAR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredAvatar(dataUrl: string | null, userId?: string | null) {
  try {
    const key = avatarStorageKey(userId);
    if (dataUrl) localStorage.setItem(key, dataUrl);
    else localStorage.removeItem(key);
    if (userId) localStorage.removeItem(AVATAR_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Drop avatar keys for other accounts (login, logout, demo swap). */
export function clearMismatchedAvatarKeys(activeUserId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const keep = new Set<string>();
    if (activeUserId) keep.add(avatarStorageKey(activeUserId));
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === AVATAR_STORAGE_KEY || key.startsWith(AVATAR_STORAGE_PREFIX)) {
        if (!keep.has(key)) toRemove.push(key);
      }
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
