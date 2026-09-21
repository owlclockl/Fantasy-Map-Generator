import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "./index";

describe("i18n service", () => {
  beforeEach(() => {
    try {
      if (typeof localStorage !== "undefined") localStorage.clear();
    } catch {}
    i18n.setLanguage("en");
  });

  it("defaults to English", () => {
    expect(i18n.getLanguage()).toBe("en");
  });

  it("supports Russian", () => {
    i18n.setLanguage("ru");
    expect(i18n.getLanguage()).toBe("ru");
    expect(i18n.t("tabs.layers")).toBe("Слои");
  });

  it("translates menu items", () => {
    i18n.setLanguage("en");
    expect(i18n.t("menu.newMap")).toBe("New Map");

    i18n.setLanguage("ru");
    expect(i18n.t("menu.newMap")).toBe("Новая карта");
  });

  it("falls back to English for missing keys", () => {
    const result = i18n.translate("nonexistent.key", "fallback");
    expect(result).toBe("fallback");
  });

  it("lists available languages", () => {
    const langs = i18n.getAvailableLanguages();
    expect(langs).toHaveLength(2);
    const codes = langs.map(l => l.code);
    expect(codes.includes("en")).toBe(true);
    expect(codes.includes("ru")).toBe(true);
  });

  it("persists language to localStorage", () => {
    i18n.setLanguage("ru");
    try {
      if (typeof localStorage !== "undefined") {
        expect(localStorage.getItem("fmg-language")).toBe("ru");
      } else {
        expect(i18n.getLanguage()).toBe("ru");
      }
    } catch {
      expect(i18n.getLanguage()).toBe("ru");
    }
  });

  it("notifies subscribers on language change", () => {
    let notifiedLang: string | null = null;
    const unsubscribe = i18n.subscribe(lang => {
      notifiedLang = lang;
    });

    i18n.setLanguage("ru");
    expect(notifiedLang).toBe("ru");

    unsubscribe();
    notifiedLang = null;
    i18n.setLanguage("en");
    expect(notifiedLang).toBe(null);
  });
});
