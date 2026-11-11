"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translate } from "@/lib/i18n/messages";
import {
  getPreferredLanguageClient,
  type AppLanguageCode,
} from "@/lib/i18n/preference";

type LanguageContextValue = {
  language: AppLanguageCode;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  t: (key) => translate("en", key),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguageCode>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguageClient());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<AppLanguageCode>).detail;
      if (detail) setLanguage(detail);
      else setLanguage(getPreferredLanguageClient());
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

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
