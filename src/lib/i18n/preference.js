export const LANGUAGE_COOKIE = "waypoint_lang";
export const LANGUAGE_STORAGE_KEY = "waypoint:preferred-language";
export const LANGUAGE_OPTIONS = [
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
export function normalizeLanguage(value) {
    if (!value)
        return "en";
    const raw = value.trim().toLowerCase().replace("_", "-");
    const short = raw.split("-")[0];
    if (ALLOWED.has(short))
        return short;
    return "en";
}
export function languageDisplayName(code) {
    return (LANGUAGE_OPTIONS.find((o) => o.code === code)?.nativeLabel ?? "English");
}
export function getPreferredLanguageClient() {
    try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored)
            return normalizeLanguage(stored);
        const match = document.cookie
            .split(";")
            .map((part) => part.trim())
            .find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`));
        if (match)
            return normalizeLanguage(match.split("=")[1]);
        if (typeof navigator !== "undefined" && navigator.language) {
            return normalizeLanguage(navigator.language);
        }
    }
    catch {
        /* ignore */
    }
    return "en";
}
export function setPreferredLanguageClient(code) {
    const next = normalizeLanguage(code);
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    }
    catch {
        /* ignore */
    }
    document.cookie = `${LANGUAGE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    window.dispatchEvent(new CustomEvent("waypoint:language", { detail: next }));
}
export function readLanguageFromCookieHeader(cookieHeader) {
    if (!cookieHeader)
        return "en";
    const match = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`));
    return normalizeLanguage(match?.split("=")[1]);
}
