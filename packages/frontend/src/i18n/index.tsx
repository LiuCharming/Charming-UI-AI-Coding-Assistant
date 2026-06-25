import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import zhCN from "./locales/zh-CN";
import en from "./locales/en";

export type LocaleCode = "zh-CN" | "en";

const locales: Record<LocaleCode, typeof zhCN> = { "zh-CN": zhCN, en };

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (l: LocaleCode) => void;
  t: TFunction;
  tArray: (key: string) => string[];
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh-CN",
  setLocale: () => {},
  t: (() => "") as unknown as TFunction,
  tArray: () => [],
});

// Simple template interpolation: t("error.noApiKey", { provider: "openai" })
// Returns string for text translations. Use tArray() for array values (e.g. suggestions).
type TFunction = (key: string, params?: Record<string, string | number>) => string;

function resolveKey(locale: LocaleCode, key: string): unknown {
  const dict = locales[locale];

  const parts = key.split(".");
  let value: unknown = dict;
  for (const part of parts) {
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      // Fallback to English
      let enValue: unknown = en;
      for (const p of parts) {
        if (enValue && typeof enValue === "object" && p in enValue) {
          enValue = (enValue as Record<string, unknown>)[p];
        } else {
          return undefined; // Key not found in either locale
        }
      }
      return enValue;
    }
  }
  return value;
}

function createT(locale: LocaleCode): TFunction {
  return (key: string, params?: Record<string, string | number>) => {
    const raw = resolveKey(locale, key);

    if (typeof raw === "string") {
      let result = raw;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    }

    // Array values should use tArray() instead
    if (Array.isArray(raw)) {
      return raw.join("\n");
    }

    return key;
  };
}

function createTArray(locale: LocaleCode): (key: string) => string[] {
  return (key: string) => {
    const raw = resolveKey(locale, key);
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === "string") return [raw];
    return [];
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    return (localStorage.getItem("charming-locale") as LocaleCode) || "zh-CN";
  });

  const setLocale = useCallback((l: LocaleCode) => {
    setLocaleState(l);
    localStorage.setItem("charming-locale", l);
  }, []);

  const t = createT(locale);
  const tArray = createTArray(locale);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, tArray }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export const SUPPORTED_LOCALES: { code: LocaleCode; name: string; flag: string }[] = [
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳" },
  { code: "en", name: "English", flag: "🇺🇸" },
];
