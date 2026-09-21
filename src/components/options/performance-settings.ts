import { closeDialogs, destroyDialog } from "@/components/dialog/dialog-helpers";
import {
  onPerformanceChange,
  PERFORMANCE_PRESETS,
  resolvePerformancePreset,
  type PerformanceSettings as Settings,
  setPerformanceSetting
} from "@/components/performance";
import { ensureEl } from "@/utils/nodeUtils";
import { i18n } from "@/services/i18n";
import { getGenerationWorkerPool, getGlobalWorkerPool } from "@/utils/worker-pool";

const DIALOG_ID = "performanceSettings";
const DEFAULTS = PERFORMANCE_PRESETS.balance;

interface Choice {
  value: string;
  label: string;
}

interface Setting {
  key: keyof Settings;
  label: string;
  tip: string;
  choices: Choice[];
}

// one row per field of options.app.performance; the choices are the field's values, nothing derived
const SETTINGS: Setting[] = [
  {
    key: "shapeRendering",
    label: "Shape rendering",
    tip: "SVG shape-rendering hint for the map. Crisp edges drops anti-aliasing. Chromium-based browsers rasterize on the GPU and ignore the hint for speed purposes, so it makes no difference there",
    choices: [
      { value: "geometricPrecision", label: "Geometric precision" },
      { value: "auto", label: "Auto" },
      { value: "optimizeSpeed", label: "Optimize speed" },
      { value: "crispEdges", label: "Crisp edges" }
    ]
  },
  {
    key: "stateHalos",
    label: "State halos",
    tip: "Blurred glow along state borders. It is an SVG blur filter, which is costly on big maps",
    choices: [
      { value: "true", label: "Shown" },
      { value: "false", label: "Hidden" }
    ]
  },
  {
    key: "viewportRedraw",
    label: "Redraw on zoom",
    tip: "When labels, icons and relief are redrawn during a zoom or pan. 'After zoom' redraws once per gesture: faster on big maps, but new content appears all at once",
    choices: [
      { value: "continuous", label: "While zooming" },
      { value: "settled", label: "After zoom" }
    ]
  }
];

const PRESET_LABELS: Record<string, string> = {
  quality: "Quality",
  balance: "Balance",
  speed: "Speed",
  custom: "Custom"
};

function open(): void {
  closeDialogs(`#${DIALOG_ID}, .stable`);
  render();
  const unsubscribe = onPerformanceChange(sync); // a preset picked on the Options tab shows here too

  $(`#${DIALOG_ID}`).dialog({
    title: i18n.getLanguage() === "ru" ? "Настройки производительности" : "Performance Settings",
    resizable: false,
    width: "420px",
    position: { my: "right top", at: "right-10 top+10", of: "svg" },
    close: () => {
      unsubscribe();
      destroyDialog(DIALOG_ID);
    }
  });
}

function render(): void {
  destroyDialog(DIALOG_ID);
  ensureEl("dialogs").insertAdjacentHTML("beforeend", buildDialogHTML());

  for (const { key } of SETTINGS) {
    const select = ensureEl<HTMLSelectElement>(`${DIALOG_ID}_${key}`);
    select.addEventListener("change", () => update(key, select.value));
    ensureEl(`${DIALOG_ID}_${key}Reset`).addEventListener("click", () => update(key, String(DEFAULTS[key])));
  }

  // Threading controls
  try {
    const threadingEnabledSelect = document.getElementById(`${DIALOG_ID}_threadingEnabled`) as HTMLSelectElement | null;
    if (threadingEnabledSelect) {
      threadingEnabledSelect.addEventListener("change", e => {
        const enabled = (e.target as HTMLSelectElement).value === "true";
        Options.set(o => (o.app.ui.threading.enabled = enabled));
      });
    }

    const workersInput = document.getElementById(`${DIALOG_ID}_workers`) as HTMLInputElement | null;
    if (workersInput) {
      workersInput.addEventListener("change", e => {
        const count = Number((e.target as HTMLInputElement).value);
        Options.set(o => (o.app.ui.threading.workers = count));
        try {
          getGenerationWorkerPool().setMaxWorkers(count);
          getGlobalWorkerPool().setMaxWorkers(Math.max(2, count - 1));
        } catch {}
        syncThreadingStats();
      });
    }
  } catch {}

  syncThreadingStats();
  const interval = setInterval(syncThreadingStats, 1000);

  const dialog = document.getElementById(DIALOG_ID);
  if (dialog) {
    const observer = new MutationObserver(() => {
      if (!document.getElementById(DIALOG_ID)) {
        clearInterval(interval);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

/** A select carries strings; the field decides what the string means */
function update(key: keyof Settings, raw: string): void {
  if (key === "stateHalos") setPerformanceSetting(key, raw === "true");
  else setPerformanceSetting(key, raw as Settings[typeof key]);
}

/** The dialog is a view of options.app.performance, whoever wrote it */
function sync(): void {
  const current = options.app.performance;
  for (const { key } of SETTINGS) ensureEl<HTMLSelectElement>(`${DIALOG_ID}_${key}`).value = String(current[key]);
  ensureEl(`${DIALOG_ID}Preset`).textContent = presetLabel();
}

function syncThreadingStats(): void {
  try {
    const genStats = getGenerationWorkerPool().getStats();
    const globalStats = getGlobalWorkerPool().getStats();

    const genEl = document.getElementById(`${DIALOG_ID}_genStats`);
    if (genEl) {
      genEl.textContent = `${genStats.busyWorkers}/${genStats.totalWorkers} busy, ${genStats.completedTasks} completed`;
    }

    const globalEl = document.getElementById(`${DIALOG_ID}_globalStats`);
    if (globalEl) {
      globalEl.textContent = `${globalStats.busyWorkers}/${globalStats.totalWorkers} busy, ${globalStats.completedTasks} completed`;
    }

    const supportEl = document.getElementById(`${DIALOG_ID}_support`);
    if (supportEl) {
      supportEl.textContent = genStats.isSupported ? "✅ Supported" : "❌ Not supported (fallback)";
    }

    const hwEl = document.getElementById(`${DIALOG_ID}_hw`);
    if (hwEl) {
      hwEl.textContent = `${navigator.hardwareConcurrency || "unknown"} cores`;
    }
  } catch {}
}

const presetLabel = (): string => PRESET_LABELS[resolvePerformancePreset(options.app.performance)];

function buildDialogHTML(): string {
  const current = options.app.performance;
  const isRu = i18n.getLanguage() === "ru";
  const ui = options.app.ui;

  const rows = SETTINGS.map(({ key, label, tip, choices }) => {
    const value = String(current[key]);
    const optionsHtml = choices
      .map(choice => `<option value="${choice.value}" ${choice.value === value ? "selected" : ""}>${choice.label}</option>`)
      .join("");
    return /* html */ `
      <tr data-tip="${tip}">
        <td>${label}</td>
        <td><select id="${DIALOG_ID}_${key}" style="width: 100%">${optionsHtml}</select></td>
        <td>
          <button id="${DIALOG_ID}_${key}Reset" data-tip="Reset to the Balance preset value"
            style="font-size: .85em; padding: 1px 5px; margin-left: .3em">↺</button>
        </td>
      </tr>`;
  }).join("");

  return /* html */ `
    <div id="${DIALOG_ID}" class="dialog" style="display: none">
      <p data-tip="The preset on the Options tab these settings amount to" style="margin: 0 0 .5em">
        Preset: <b id="${DIALOG_ID}Preset">${presetLabel()}</b>
      </p>
      <table style="border-collapse: collapse; width: 100%">
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top:1em; padding-top:1em; border-top:1px solid #e5e7eb">
        <h4 style="margin:0 0 0.5em 0; font-size:1em; font-weight:700; display:flex; align-items:center; gap:6px">
          ⚡ ${isRu ? "Многопоточность (Web Workers)" : "Multithreading (Web Workers)"}
        </h4>

        <table style="border-collapse: collapse; width: 100%; font-size:0.9em">
          <tr>
            <td>${isRu ? "Статус поддержки" : "Support status"}</td>
            <td><span id="${DIALOG_ID}_support">checking...</span></td>
          </tr>
          <tr>
            <td>${isRu ? "Ядра процессора" : "Hardware cores"}</td>
            <td><span id="${DIALOG_ID}_hw">${navigator.hardwareConcurrency || "unknown"}</span></td>
          </tr>
          <tr data-tip="Enable or disable multithreading">
            <td>${isRu ? "Многопоточность" : "Threading"}</td>
            <td>
              <select id="${DIALOG_ID}_threadingEnabled" style="width:100%">
                <option value="true" ${ui.threading.enabled ? "selected" : ""}>${isRu ? "Включено" : "Enabled"}</option>
                <option value="false" ${!ui.threading.enabled ? "selected" : ""}>${isRu ? "Отключено" : "Disabled"}</option>
              </select>
            </td>
          </tr>
          <tr data-tip="Number of worker threads">
            <td>${isRu ? "Потоки воркеров" : "Worker threads"}</td>
            <td>
              <input id="${DIALOG_ID}_workers" type="range" min="1" max="8" value="${ui.threading.workers}" style="width:60%">
              <output>${ui.threading.workers}</output>
            </td>
          </tr>
          <tr>
            <td>${isRu ? "Генерация" : "Generation pool"}</td>
            <td><span id="${DIALOG_ID}_genStats" style="font-family:monospace; font-size:0.85em">-</span></td>
          </tr>
          <tr>
            <td>${isRu ? "Глобальный пул" : "Global pool"}</td>
            <td><span id="${DIALOG_ID}_globalStats" style="font-family:monospace; font-size:0.85em">-</span></td>
          </tr>
        </table>

        <div style="margin-top:0.8em; padding:8px 10px; background:#f3f4f6; border-radius:8px; font-size:0.8em; color:#6b7280; border-left:3px solid #6366f1">
          ${isRu
            ? "💡 Многопоточность ускоряет генерацию карты, используя все ядра процессора. Если возникают проблемы, отключите её."
            : "💡 Multithreading speeds up map generation by using all CPU cores. If you experience issues, disable it."}
        </div>
      </div>
    </div>`;
}

export const PerformanceSettings = { open };
