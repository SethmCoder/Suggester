export const LANGUAGE_COOKIE = "waypoint_lang";
export const LANGUAGE_STORAGE_KEY = "waypoint:preferred-language";

export type AppLanguageCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "ja"
  | "zh"
  | "ko"
  | "pt"
  | "it";

export const LANGUAGE_OPTIONS: {
  code: AppLanguageCode;
  label: string;
  nativeLabel: string;
}[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
];

const ALLOWED = new Set(LANGUAGE_OPTIONS.map((o) => o.code));

export function normalizeLanguage(
  value: string | null | undefined,
): AppLanguageCode {
  if (!value) return "en";
  const raw = value.trim().toLowerCase().replace("_", "-");
  const short = raw.split("-")[0] as AppLanguageCode;
  if (ALLOWED.has(short)) return short;
  return "en";
}

export function languageDisplayName(code: AppLanguageCode): string {
  return (
    LANGUAGE_OPTIONS.find((o) => o.code === code)?.nativeLabel ?? "English"
  );
}

export function getPreferredLanguageClient(): AppLanguageCode {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored) return normalizeLanguage(stored);
    const match = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`));
    if (match) return normalizeLanguage(match.split("=")[1]);
    if (typeof navigator !== "undefined" && navigator.language) {
      return normalizeLanguage(navigator.language);
    }
  } catch {
    /* ignore */
  }
  return "en";
}

export function setPreferredLanguageClient(code: AppLanguageCode) {
  const next = normalizeLanguage(code);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  document.cookie = `${LANGUAGE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  window.dispatchEvent(
    new CustomEvent("waypoint:language", { detail: next }),
  );
}

export function readLanguageFromCookieHeader(
  cookieHeader: string | null | undefined,
): AppLanguageCode {
  if (!cookieHeader) return "en";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`));
  return normalizeLanguage(match?.split("=")[1]);
}
