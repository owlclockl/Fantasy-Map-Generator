// Bottom sheet with burg/state details, fetched from the PC on demand
import type { BurgDetails, StateDetails } from "@/types/mobile-protocol";

const LANG = navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";

const t = {
  population: LANG === "ru" ? "Население" : "Population",
  state: LANG === "ru" ? "Государство" : "State",
  culture: LANG === "ru" ? "Культура" : "Culture",
  capital: LANG === "ru" ? "Столица" : "Capital",
  port: LANG === "ru" ? "Порт" : "Port",
  area: LANG === "ru" ? "Площадь" : "Area",
  burgs: LANG === "ru" ? "Города" : "Burgs",
  rural: LANG === "ru" ? "Сельское" : "Rural",
  urban: LANG === "ru" ? "Городское" : "Urban",
  focus: LANG === "ru" ? "Показать на ПК" : "Show on PC",
  features: LANG === "ru" ? "Ремёсла и постройки" : "Features",
  close: LANG === "ru" ? "Закрыть" : "Close"
};

const formatNumber = (value: number): string => new Intl.NumberFormat(LANG === "ru" ? "ru-RU" : "en-US").format(Math.round(value));

const row = (label: string, value: string): string => `<div class="sheetRow"><span>${label}</span><b>${value}</b></div>`;

export class DetailsPanel {
  private sheet: HTMLElement;
  private onClose: () => void;
  onFocus: (burgId: number) => void;

  constructor(sheet: HTMLElement, onFocus: (burgId: number) => void, onClose: () => void) {
    this.sheet = sheet;
    this.onFocus = onFocus;
    this.onClose = onClose;
  }

  showBurg(burg: BurgDetails, focusable = true): void {
    const featureNames: Record<string, { en: string; ru: string }> = {
      walls: { en: "Walls", ru: "Стены" },
      citadel: { en: "Citadel", ru: "Цитадель" },
      plaza: { en: "Market plaza", ru: "Рыночная площадь" },
      temple: { en: "Temple", ru: "Храм" },
      shanty: { en: "Shanty town", ru: "Нищебный квартал" }
    };
    const features = Object.entries(burg.features ?? {})
      .filter(([, present]) => present)
      .map(([key]) => `<span class="chip">${featureNames[key]?.[LANG] ?? key}</span>`)
      .join("");

    this.sheet.innerHTML = `
      <div class="sheetHandle"></div>
      <div class="sheetHeader">
        <span class="swatch" style="background:${"var(--accent)"}"></span>
        <h2>${burg.name}${burg.capital ? ` 👑` : ""}${burg.port ? " ⚓" : ""}</h2>
      </div>
      ${row(t.population, formatNumber(burg.population))}
      ${burg.stateName ? row(t.state, burg.stateName) : ""}
      ${burg.cultureName ? row(t.culture, burg.cultureName) : ""}
      ${features ? `<div class="chips">${features}</div>` : ""}
      <div class="sheetActions">
        ${focusable ? `<button id="sheetFocus" class="primary small">${t.focus}</button>` : ""}
        <button id="sheetClose" class="ghost small">${t.close}</button>
      </div>
    `;
    this.open();
    document.getElementById("sheetFocus")?.addEventListener("click", () => this.onFocus(burg.i));
    document.getElementById("sheetClose")?.addEventListener("click", () => this.hide());
  }

  showState(state: StateDetails): void {
    this.sheet.innerHTML = `
      <div class="sheetHandle"></div>
      <div class="sheetHeader">
        <span class="swatch" style="background:${state.color}"></span>
        <h2>${state.name}${state.formName ? ` <small>${state.formName}</small>` : ""}</h2>
      </div>
      ${row(t.population, formatNumber(state.population))}
      ${row(t.area, `${formatNumber(state.area)} ${LANG === "ru" ? "кв. миль" : "sq mi"}`)}
      ${row(t.burgs, formatNumber(state.burgs ?? 0))}
      ${row(t.rural, formatNumber(state.rural ?? 0))}
      ${row(t.urban, formatNumber(state.urban ?? 0))}
      <div class="sheetActions"><button id="sheetClose" class="ghost small">${t.close}</button></div>
    `;
    this.open();
    document.getElementById("sheetClose")?.addEventListener("click", () => this.hide());
  }

  private open(): void {
    this.sheet.classList.remove("hidden");
  }

  hide(): void {
    this.sheet.classList.add("hidden");
    this.onClose();
  }
}
