// Tools tab: buttons dispatch the same commands as global search.
// Enhanced with modern UI and i18n (Russian)
import { MAP_COMMANDS } from "@/components/map-commands";
import { tip } from "@/components/tooltips";
import { i18n } from "@/services/i18n";
import { ensureEl } from "@/utils";

function buildToolsTemplate(): string {
  const lang = i18n.getLanguage();
  const isRu = lang === "ru";
  const dict = (() => {
    try {
      return i18n.getDictionary().tools;
    } catch {
      return null;
    }
  })();

  const t = (en: string, ru: string) => (isRu ? ru : en);

  return /* html */ `
  <div class="separator" style="font-weight:700; font-size:0.9em; color:#111827; margin:16px 0 8px 0; padding:8px 12px; background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border-radius:8px; display:flex; align-items:center; gap:6px">
    <span>✏️</span> ${t("Edit", "Редактировать")}
  </div>
  <div class="grid" style="gap:6px">
    <button id="editBiomesButton" data-tip="${t("Click to open Biomes Editor", "Открыть редактор биомов")}" data-shortcut="Shift + B" style="border-radius:8px">
      🌿 ${dict?.biomes || t("Biomes", "Биомы")}
    </button>
    <button id="overviewBurgsButton" data-tip="${t("Click to open Burgs Overview", "Обзор поселений")}" data-shortcut="Shift + T" style="border-radius:8px">
      🏘️ ${dict?.burgs || t("Burgs", "Поселения")}
    </button>
    <button id="editCoastlineSettings" data-tip="${t("Click to open Coastline Editor", "Редактор береговой линии")}" style="border-radius:8px">
      🌊 ${dict?.coastline || t("Coastlines", "Берега")}
    </button>
    <button id="editCulturesButton" data-tip="${t("Click to open Cultures Editor", "Редактор культур")}" data-shortcut="Shift + C" style="border-radius:8px">
      🎭 ${dict?.cultures || t("Cultures", "Культуры")}
    </button>
    <button id="editDiplomacyButton" data-tip="${t("Click to open Diplomatical relationships Editor", "Дипломатия")}" data-shortcut="Shift + D" style="border-radius:8px">
      🤝 ${t("Diplomacy", "Дипломатия")}
    </button>
    <button id="editEmblemButton" data-tip="${t("Click to open Emblem Editor", "Редактор гербов")}" data-shortcut="Shift + Y" style="border-radius:8px">
      🛡️ ${dict?.emblems || t("Emblems", "Гербы")}
    </button>
    <button id="overviewFeaturesButton" data-tip="${t("Click to open Geographical Features Overview", "Географические объекты")}" data-shortcut="Shift + F" style="border-radius:8px">
      ⛰️ ${t("Features", "Объекты")}
    </button>
    <button id="editGoods" data-tip="${t("Click to open Goods Editor", "Редактор товаров")}" data-shortcut="Shift + G" style="border-radius:8px">
      📦 ${t("Goods", "Товары")}
    </button>
    <button id="editHeightmapButton" data-tip="${t("Click to open Heightmap customization menu", "Настройка карты высот")}" data-shortcut="Shift + H" style="border-radius:8px">
      🗻 ${dict?.heightmap || t("Heightmap", "Высоты")}
    </button>
    <button id="overviewMarkersButton" data-tip="${t("Click to open Markers Overview", "Обзор маркеров")}" data-shortcut="Shift + K" style="border-radius:8px">
      📍 ${dict?.markers || t("Markers", "Маркеры")}
    </button>
    <button id="overviewMarketsButton" data-tip="${t("Click to open Markets Overview", "Обзор рынков")}" style="border-radius:8px">
      🏪 ${t("Markets", "Рынки")}
    </button>
    <button id="editMeasurersButton" data-tip="${t("Click to open Measurers Editor", "Редактор измерений")}" data-shortcut="Shift + =" style="border-radius:8px">
      📏 ${t("Measurers", "Измерения")}
    </button>
    <button id="overviewLabelsButton" data-tip="${t("Click to open Labels Overview", "Обзор меток")}" data-shortcut="Shift + L" style="border-radius:8px">
      🏷️ ${dict?.labels || t("Labels", "Метки")}
    </button>
    <button id="overviewMilitaryButton" data-tip="${t("Click to open Military Forces Overview", "Военные силы")}" data-shortcut="Shift + M" style="border-radius:8px">
      ⚔️ ${t("Military", "Армия")}
    </button>
    <button id="editNamesBaseButton" data-tip="${t("Click to open Namesbase Editor", "База имён")}" data-shortcut="Shift + N" style="border-radius:8px">
      📝 ${dict?.namebase || t("Namesbase", "Имена")}
    </button>
    <button id="editNotesButton" data-tip="${t("Click to open Notes Editor", "Редактор заметок")}" data-shortcut="Shift + O" style="border-radius:8px">
      📓 ${dict?.notes || t("Notes", "Заметки")}
    </button>
    <button id="editProvincesButton" data-tip="${t("Click to open Provinces Editor", "Редактор провинций")}" data-shortcut="Shift + P" style="border-radius:8px">
      🗺️ ${dict?.provinces || t("Provinces", "Провинции")}
    </button>
    <button id="editReligions" data-tip="${t("Click to open Religions Editor", "Редактор религий")}" data-shortcut="Shift + R" style="border-radius:8px">
      ⛪ ${dict?.religions || t("Religions", "Религии")}
    </button>
    <button id="overviewRiversButton" data-tip="${t("Click to open Rivers Overview", "Обзор рек")}" data-shortcut="Shift + V" style="border-radius:8px">
      🌊 ${dict?.rivers || t("Rivers", "Реки")}
    </button>
    <button id="overviewRoutesButton" data-tip="${t("Click to open Routes Overview", "Обзор дорог")}" data-shortcut="Shift + U" style="border-radius:8px">
      🛤️ ${dict?.routes || t("Routes", "Дороги")}
    </button>
    <button id="overviewJourneysButton" data-tip="${t("Click to open Journeys Overview", "Обзор путешествий")}" data-shortcut="Shift + J" style="border-radius:8px">
      🧭 ${t("Journeys", "Путешествия")}
    </button>
    <button id="editStatesButton" data-tip="${t("Click to open States Editor", "Редактор государств")}" data-shortcut="Shift + S" style="border-radius:8px">
      🏛️ ${dict?.states || t("States", "Государства")}
    </button>
    <button id="editTradeAnimationButton" data-tip="${t("Click to open Trade Animation Editor", "Анимация торговли")}" style="border-radius:8px">
      💱 ${t("Trade", "Торговля")}
    </button>
    <button id="editUnitsButton" data-tip="${t("Click to open Units Editor", "Редактор юнитов")}" data-shortcut="Shift + Q" style="border-radius:8px">
      🎖️ ${dict?.units || t("Units", "Юниты")}
    </button>
    <button id="editZonesButton" data-tip="${t("Click to open Zones Editor", "Редактор зон")}" data-shortcut="Shift + Z" style="border-radius:8px">
      🔲 ${dict?.zones || t("Zones", "Зоны")}
    </button>
  </div>
  <div class="separator" style="font-weight:700; font-size:0.9em; color:#111827; margin:16px 0 8px 0; padding:8px 12px; background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border-radius:8px; display:flex; align-items:center; gap:6px">
    <span>🔄</span> ${t("Regenerate", "Пересоздать")}
  </div>
  <div id="regenerateFeature" class="grid" style="gap:6px">
    <button id="regenerateBurgs" data-tip="${t("Regenerate burgs and routes", "Пересоздать поселения")}" style="border-radius:8px">🏘️ ${t("Burgs", "Поселения")}</button>
    <button id="regenerateCultures" data-tip="${t("Regenerate cultures", "Пересоздать культуры")}" style="border-radius:8px">🎭 ${t("Cultures", "Культуры")}</button>
    <button id="regenerateEconomy" data-tip="${t("Rebuild economy", "Пересоздать экономику")}" style="border-radius:8px">💰 ${t("Economy", "Экономика")}</button>
    <button id="regenerateEmblems" data-tip="${t("Regenerate emblems", "Пересоздать гербы")}" style="border-radius:8px">🛡️ ${t("Emblems", "Гербы")}</button>
    <button id="regenerateGoods" data-tip="${t("Regenerate goods", "Пересоздать товары")}" style="border-radius:8px">📦 ${t("Goods", "Товары")}</button>
    <button id="regenerateIce" data-tip="${t("Regenerate ice", "Пересоздать лёд")}" style="border-radius:8px">🧊 ${t("Ice", "Лёд")}</button>
    <button id="regenerateStateLabels" data-tip="${t("Update state labels", "Обновить метки государств")}" style="border-radius:8px">🏷️ ${t("State Labels", "Метки гос-в")}</button>
    <button id="regenerateMarkers" data-tip="${t("Regenerate markers", "Пересоздать маркеры")}" style="border-radius:8px">
      📍 ${t("Markers", "Маркеры")} <i id="configRegenerateMarkers" class="icon-cog" data-tip="Set number"></i>
    </button>
    <button id="regenerateMarkets" data-tip="${t("Regenerate markets", "Пересоздать рынки")}" style="border-radius:8px">🏪 ${t("Markets", "Рынки")}</button>
    <button id="regenerateMilitary" data-tip="${t("Recalculate military", "Пересчитать армию")}" style="border-radius:8px">⚔️ ${t("Military", "Армия")}</button>
    <button id="regeneratePopulation" data-tip="${t("Recalculate population", "Пересчитать население")}" style="border-radius:8px">👥 ${t("Population", "Население")}</button>
    <button id="regenerateProduction" data-tip="${t("Regenerate production", "Пересоздать производство")}" style="border-radius:8px">🏭 ${t("Production", "Производство")}</button>
    <button id="regenerateProvinces" data-tip="${t("Regenerate provinces", "Пересоздать провинции")}" style="border-radius:8px">🗺️ ${t("Provinces", "Провинции")}</button>
    <button id="regenerateReliefIcons" data-tip="${t("Regenerate relief", "Пересоздать рельеф")}" style="border-radius:8px">⛰️ ${dict?.relief || t("Relief", "Рельеф")}</button>
    <button id="regenerateReligions" data-tip="${t("Regenerate religions", "Пересоздать религии")}" style="border-radius:8px">⛪ ${t("Religions", "Религии")}</button>
    <button id="regenerateRivers" data-tip="${t("Regenerate rivers", "Пересоздать реки")}" style="border-radius:8px">🌊 ${t("Rivers", "Реки")}</button>
    <button id="regenerateRoutes" data-tip="${t("Regenerate routes", "Пересоздать дороги")}" style="border-radius:8px">🛤️ ${t("Routes", "Дороги")}</button>
    <button id="regenerateStates" data-tip="${t("Regenerate states", "Пересоздать государства")}" style="border-radius:8px">🏛️ ${t("States", "Гос-ва")}</button>
    <button id="regenerateZones" data-tip="${t("Regenerate zones", "Пересоздать зоны")}" style="border-radius:8px">🔲 ${t("Zones", "Зоны")}</button>
  </div>
  <div class="separator" style="font-weight:700; font-size:0.9em; color:#111827; margin:16px 0 8px 0; padding:8px 12px; background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border-radius:8px; display:flex; align-items:center; gap:6px">
    <span>➕</span> ${t("Add", "Добавить")}
  </div>
  <div id="addFeature" class="grid" style="gap:6px">
    <button id="addBurgTool" data-tip="${t("Place a burg", "Разместить поселение")}" data-shortcut="Shift + 1" style="border-radius:8px; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none">🏘️ ${t("Burg", "Поселение")}</button>
    <button id="addLabel" data-tip="${t("Place label", "Разместить метку")}" data-shortcut="Shift + 2" style="border-radius:8px; background:linear-gradient(135deg, #6366f1, #4f46e5); color:white; border:none">🏷️ ${t("Label", "Метка")}</button>
    <button id="addMarker" data-tip="${t("Place marker", "Разместить маркер")}" data-shortcut="Shift + 3" style="border-radius:8px; background:linear-gradient(135deg, #f59e0b, #d97706); color:white; border:none">📍 ${t("Marker", "Маркер")}</button>
    <input type="hidden" id="addedMarkerType" name="addedMarkerType" value="" />
    <button id="addRiver" data-tip="${t("Place river", "Разместить реку")}" data-shortcut="Shift + 4" style="border-radius:8px; background:linear-gradient(135deg, #06b6d4, #0891b2); color:white; border:none">🌊 ${t("River", "Река")}</button>
    <button id="addRoute" data-tip="${t("Create route", "Создать дорогу")}" data-shortcut="Shift + 5" style="border-radius:8px; background:linear-gradient(135deg, #8b5cf6, #7c3aed); color:white; border:none">🛤️ ${t("Route", "Дорога")}</button>
  </div>
  <div class="separator" style="font-weight:700; font-size:0.9em; color:#111827; margin:16px 0 8px 0; padding:8px 12px; background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border-radius:8px; display:flex; align-items:center; gap:6px">
    <span>👁️</span> ${t("Show", "Показать")}
  </div>
  <div class="grid" style="gap:6px">
    <button id="overviewCellsButton" data-tip="${t("Cell details", "Детали ячейки")}" data-shortcut="Shift + E" style="border-radius:8px">🔬 ${t("Cells", "Ячейки")}</button>
    <button id="overviewChartsButton" data-tip="${t("Charts overview", "Обзор графиков")}" data-shortcut="Shift + A" style="border-radius:8px">📊 ${t("Charts", "Графики")}</button>
    <button id="openMinimapButton" data-tip="${t("Minimap overview", "Обзор миникарты")}" style="border-radius:8px">🗺️ ${t("Minimap", "Миникарта")}</button>
  </div>
  <div class="separator" style="font-weight:700; font-size:0.9em; color:#111827; margin:16px 0 8px 0; padding:8px 12px; background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border-radius:8px; display:flex; align-items:center; gap:6px">
    <span>🛠️</span> ${t("Create", "Создать")}
  </div>
  <div class="grid" style="gap:6px">
    <button id="openSubmapTool" data-tip="${t("Generate submap", "Создать подкарту")}" style="border-radius:8px">🗺️ ${t("Submap", "Подкарта")}</button>
    <button id="openTransformTool" data-tip="${t("Transform map", "Трансформировать")}" style="border-radius:8px">🔄 ${t("Transform", "Трансформ")}</button>
    <button id="openWrapTool" data-tip="${t("Wrap map", "Обернуть карту")}" style="border-radius:8px">🌐 ${t("Wrap", "Обёртка")}</button>
  </div>
`;
}

const TEMPLATE = buildToolsTemplate();

ensureEl("toolsContent").innerHTML = TEMPLATE;

if (typeof window !== "undefined") {
  window.addEventListener("language:changed", () => {
    const container = document.getElementById("toolsContent");
    if (container) {
      const scrollPos = container.scrollTop;
      const isVisible = container.style.display !== "none";
      container.innerHTML = buildToolsTemplate();
      container.scrollTop = scrollPos;
      if (!isVisible) container.style.display = "none";
    }
  });
}

ensureEl("toolsContent").addEventListener("click", event => {
  if (customization) return tip("Please exit the customization mode first", false, "error");
  if (!(event instanceof MouseEvent) || !(event.target instanceof HTMLElement)) return;
  if (!["BUTTON", "I"].includes(event.target.tagName)) return;
  const command = MAP_COMMANDS.find(command => command.id === (event.target as HTMLElement).id);
  if (command) void command.run(event);
});
