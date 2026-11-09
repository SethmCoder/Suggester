export const AVATAR_STORAGE_KEY = "waypoint:avatarDataUrl";

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

export function readStoredAvatar(): string | null {
  try {
    return localStorage.getItem(AVATAR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredAvatar(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(AVATAR_STORAGE_KEY, dataUrl);
    else localStorage.removeItem(AVATAR_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}
