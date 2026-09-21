import { en, type Language } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";

export type { Language } from "./dictionaries/en";

const dictionaries = {
  en,
  ru
} as const;

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string ? (T[K] extends object ? `${K}.${NestedKeyOf<T[K]>}` : K) : never;
    }[keyof T]
  : never;

type DeepValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? DeepValue<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

type TranslationKey = NestedKeyOf<typeof en>;

const STORAGE_KEY = "fmg-language";
const DEFAULT_LANGUAGE: Language = "en";

class I18nService {
  private currentLanguage: Language = DEFAULT_LANGUAGE;
  private listeners: Set<(lang: Language) => void> = new Set();

  constructor() {
    this.detectLanguage();
  }

  private detectLanguage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored && stored in dictionaries) {
        this.currentLanguage = stored;
        return;
      }

      const navLang = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
      if (navLang.startsWith("ru") || navLang.startsWith("be") || navLang.startsWith("uk")) {
        this.currentLanguage = "ru";
      } else {
        this.currentLanguage = DEFAULT_LANGUAGE;
      }
    } catch {
      this.currentLanguage = DEFAULT_LANGUAGE;
    }
  }

  getLanguage(): Language {
    return this.currentLanguage;
  }

  getAvailableLanguages(): { code: Language; name: string; nativeName: string }[] {
    return [
      { code: "en", name: "English", nativeName: "English" },
      { code: "ru", name: "Russian", nativeName: "Русский" }
    ];
  }

  setLanguage(lang: Language): void {
    if (!(lang in dictionaries)) {
      console.warn(`Unsupported language: ${lang}`);
      return;
    }

    this.currentLanguage = lang;

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }

    try {
      if (typeof document !== "undefined") document.documentElement.lang = lang;
    } catch {}

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(lang);
      } catch (e) {
        console.error("i18n listener error", e);
      }
    }

    // Dispatch custom event for legacy code
    try {
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("language:changed", { detail: { language: lang } }));
    } catch {}
  }

  subscribe(callback: (lang: Language) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  t<K extends TranslationKey>(key: K): DeepValue<typeof en, K> {
    const keys = (key as string).split(".");
    let value: any = dictionaries[this.currentLanguage];

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        // Fallback to English
        let fallback: any = en;
        for (const fk of keys) {
          if (fallback && typeof fallback === "object" && fk in fallback) {
            fallback = fallback[fk];
          } else {
            return key as any;
          }
        }
        return fallback;
      }
    }

    return value;
  }

  // Shorthand with fallback
  translate(key: string, fallback?: string): string {
    try {
      const result = this.t(key as TranslationKey);
      if (typeof result === "string" && result !== key) return result;
      return fallback || key;
    } catch {
      return fallback || key;
    }
  }

  // Get current dictionary
  getDictionary() {
    return dictionaries[this.currentLanguage];
  }

  // Get raw dictionaries for testing
  getRawDictionary(lang: Language) {
    return dictionaries[lang];
  }
}

export const i18n = new I18nService();

// Global exposure for legacy JS
declare global {
  // biome-ignore lint/suspicious/noRedeclare: legacy seam
  var i18n: I18nService;
  // biome-ignore lint/suspicious/noRedeclare: legacy seam
  var t: (key: string, fallback?: string) => string;
}

globalThis.i18n = i18n;
globalThis.t = (key: string, fallback?: string) => i18n.translate(key, fallback);

// Helper for templates
export function translateElement(element: HTMLElement): void {
  try {
    const key = element.dataset.i18n;
    if (!key) return;
    const translation = i18n.translate(key);
    if (translation !== key) {
      element.textContent = translation;
    }
  } catch {}
}

export function translatePage(): void {
  try {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;

    const elements = document.querySelectorAll<HTMLElement>("[data-i18n]");
    for (const el of elements) {
      translateElement(el);
    }

    // Also translate tooltips and placeholders where needed
    const tooltipElements = document.querySelectorAll<HTMLElement>("[data-i18n-tip]");
    for (const el of tooltipElements) {
      const key = el.dataset.i18nTip;
      if (!key) continue;
      const translation = i18n.translate(key);
      if (translation !== key) {
        el.dataset.tip = translation;
      }
    }
  } catch {}
}

// Auto-translate on language change
if (typeof window !== "undefined") {
  i18n.subscribe(() => {
    translatePage();
  });
}
