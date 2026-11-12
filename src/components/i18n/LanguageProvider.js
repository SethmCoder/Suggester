"use client";
import { createContext, useContext, useEffect, useMemo, useState, } from "react";
import { translate } from "@/lib/i18n/messages";
import { getPreferredLanguageClient, } from "@/lib/i18n/preference";
const LanguageContext = createContext({
    language: "en",
    t: (key) => translate("en", key),
});
export function LanguageProvider({ children }) {
    const [language, setLanguage] = useState("en");
    useEffect(() => {
        setLanguage(getPreferredLanguageClient());
        function onChange(event) {
            const detail = event.detail;
            if (detail)
                setLanguage(detail);
            else
                setLanguage(getPreferredLanguageClient());
        }
        window.addEventListener("waypoint:language", onChange);
        window.addEventListener("storage", onChange);
        return () => {
            window.removeEventListener("waypoint:language", onChange);
            window.removeEventListener("storage", onChange);
        };
    }, []);
    useEffect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.lang = language;
        }
    }, [language]);
    const value = useMemo(() => ({
        language,
        t: (key, vars) => translate(language, key, vars),
    }), [language]);
    return (React.createElement(LanguageContext.Provider, { value: value }, children));
}
export function useLanguage() {
    return useContext(LanguageContext);
}
