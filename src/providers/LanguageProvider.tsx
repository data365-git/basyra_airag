"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import uzStrings from "@/i18n/uz.json";
import ruStrings from "@/i18n/ru.json";
import enStrings from "@/i18n/en.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Language = "uz" | "ru" | "en";

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Look up a translation key, with optional {placeholder} interpolation and a last-resort fallback. */
  t: (key: string, vars?: Record<string, string> | string, fallback?: string) => string;
}

// ─── Static (bundled) strings ─────────────────────────────────────────────────

const bundled: Record<Language, Record<string, string>> = {
  uz: uzStrings as Record<string, string>,
  ru: ruStrings as Record<string, string>,
  en: enStrings as Record<string, string>,
};

// ─── Context ──────────────────────────────────────────────────────────────────

export const LanguageContext = createContext<LanguageContextValue>({
  language: "uz",
  setLanguage: () => {},
  t: (key, vars, fb) => {
    const fallback = typeof vars === "string" ? vars : (fb ?? key);
    return fallback;
  },
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("uz");
  // DB overrides: { uz: { key: value }, ru: {...}, en: {...} }
  const [dbOverrides, setDbOverrides] = useState<Record<Language, Record<string, string>>>({
    uz: {},
    ru: {},
    en: {},
  });

  // ── Bootstrap language preference ──────────────────────────────────────────
  useEffect(() => {
    const cookie = document.cookie.match(/attendtrack_lang=([^;]+)/)?.[1];
    const ls = typeof localStorage !== "undefined" ? localStorage.getItem("attendtrack_lang") : null;
    const saved = (cookie ?? ls) as Language | null;
    if (saved && ["uz", "ru", "en"].includes(saved)) {
      setLanguageState(saved);
    }
  }, []);

  // ── Fetch DB translation overrides once ────────────────────────────────────
  useEffect(() => {
    fetch("/api/translations")
      .then((r) => r.json())
      .then((data: { key: string; language: string; value: string }[]) => {
        if (!Array.isArray(data)) return;
        const overrides: Record<Language, Record<string, string>> = { uz: {}, ru: {}, en: {} };
        for (const row of data) {
          const lang = row.language as Language;
          if (overrides[lang]) overrides[lang][row.key] = row.value;
        }
        setDbOverrides(overrides);
      })
      .catch(() => {/* offline — fall back to bundled */});
  }, []);

  // ── Language setter (persists choice) ──────────────────────────────────────
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      document.cookie = `attendtrack_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("attendtrack_lang", lang);
    } catch {/* SSR guard */}
  }, []);

  // ── Translation function ───────────────────────────────────────────────────
  const t = useCallback(
    (key: string, vars?: Record<string, string> | string, fallback?: string): string => {
      // Normalise overloads: t(key, fallback) or t(key, vars, fallback)
      let variables: Record<string, string> | undefined;
      let fb: string | undefined;
      if (typeof vars === "string") {
        fb = vars;
      } else {
        variables = vars;
        fb = fallback;
      }

      // Resolution order: DB override → bundled JSON → EN bundled → fallback → key
      const value =
        dbOverrides[language]?.[key] ??
        bundled[language]?.[key] ??
        (language !== "en" ? (dbOverrides.en?.[key] ?? bundled.en?.[key]) : undefined) ??
        fb ??
        key;

      // Interpolate {placeholder} patterns
      if (!variables) return value;
      return Object.entries(variables).reduce(
        (s, [k, v]) => s.replaceAll(`{${k}}`, v),
        value
      );
    },
    [language, dbOverrides]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
