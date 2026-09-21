// The collapsible panel on the right and the sticked menu below it
// Enhanced with modern UI, animations, and i18n
import { showExportPane, showLoadPane, showSavePane } from "@/components/options/io-panes";
import { changeViewMode } from "@/components/options/view-mode";
import { clearMainTip } from "@/components/tooltips";
import { resetZoom } from "@/components/zoom";
import { Controllers } from "@/controllers";
import { ARROW_TIP_KEY } from "@/services/versioning";
import { ensureEl, findEl } from "@/utils/nodeUtils";
import { i18n } from "@/services/i18n";

const TAB_CONTENT: Record<string, string> = {
  layersTab: "layersContent",
  styleTab: "styleContent",
  optionsTab: "optionsContent",
  toolsTab: "toolsContent",
  aboutTab: "aboutContent"
};

export function showOptions(event?: Event): void {
  if (!localStorage.getItem(ARROW_TIP_KEY)) {
    clearMainTip();
    localStorage.setItem(ARROW_TIP_KEY, "true");
    ensureEl("optionsTrigger").classList.remove("glow");
  }

  const optionsEl = ensureEl("options");
  const triggerEl = ensureEl("optionsTrigger");
  const regenEl = ensureEl("regenerate");

  regenEl.style.display = "none";
  optionsEl.style.display = "block";

  // Modern animation
  optionsEl.style.opacity = "0";
  optionsEl.style.transform = "translateX(20px) scale(0.98)";
  requestAnimationFrame(() => {
    optionsEl.style.transition = "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";
    optionsEl.style.opacity = "1";
    optionsEl.style.transform = "translateX(0) scale(1)";
  });

  triggerEl.style.display = "none";

  // Update tooltip based on language
  try {
    const dict = i18n.getDictionary();
    triggerEl.dataset.tip = dict.menu.showMenu;
  } catch {}

  event?.stopPropagation();
}

export function hideOptions(event?: Event): void {
  const optionsEl = ensureEl("options");
  const triggerEl = ensureEl("optionsTrigger");

  // Modern hide animation
  optionsEl.style.transition = "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
  optionsEl.style.opacity = "0";
  optionsEl.style.transform = "translateX(20px) scale(0.98)";

  setTimeout(() => {
    optionsEl.style.display = "none";
    triggerEl.style.display = "block";
    triggerEl.style.opacity = "0";
    triggerEl.style.transform = "scale(0.9)";
    requestAnimationFrame(() => {
      triggerEl.style.transition = "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
      triggerEl.style.opacity = "1";
      triggerEl.style.transform = "scale(1)";
    });
  }, 200);

  try {
    const dict = i18n.getDictionary();
    triggerEl.dataset.tip = dict.menu.showMenu;
  } catch {}

  event?.stopPropagation();
}

export function toggleOptions(event?: Event): void {
  if (ensureEl("options").style.display === "none") showOptions(event);
  else hideOptions(event);
}

/** Open the panel on the given tab */
export function openTab(id: string): void {
  showOptions();
  selectTab(id);
}

/** Show the clicked tab, hiding whichever was open. Tools swaps in the customization menu instead */
function selectTab(id: string): void {
  const active = ensureEl("options").querySelector(".tab > button.active");
  if (active?.id === id) return;

  active?.classList.remove("active");
  ensureEl(id).classList.add("active");
  for (const content of ensureEl("options").querySelectorAll<HTMLElement>(".tabcontent")) {
    content.style.display = "none";
  }

  const shown = id === "toolsTab" && customization === 1 ? "customizationMenu" : TAB_CONTENT[id];
  if (shown) ensureEl(shown).style.display = "block";
  if (id === "styleTab") window.selectStyleElement?.();
}

/** Keep every `<x>Input` and its `<x>Output` showing the same value */
function onPanelInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.closest("[data-option]")) return;
  const { id, value } = target;

  if (id.endsWith("Input")) {
    const output = findEl<HTMLOutputElement>(`${id.slice(0, -5)}Output`);
    if (output) output.value = value;
  } else if (id.endsWith("Output")) {
    const input = findEl<HTMLInputElement>(`${id.slice(0, -6)}Input`);
    if (input) input.value = value;
  }
}

function initialize(): void {
  $("#optionsContainer").draggable({ handle: ".drag-trigger", snap: "svg", snapMode: "both" });
  $("#exitCustomization").draggable({ handle: "div" });
  $("#mapLayers").disableSelection();

  if (localStorage.getItem(ARROW_TIP_KEY)) {
    clearMainTip();
    ensureEl("optionsTrigger").classList.remove("glow");
  }

  const trigger = ensureEl("optionsTrigger");
  const quickLang = document.getElementById("quickLangToggle") as HTMLElement | null;

  trigger.addEventListener("mouseenter", () => {
    if (trigger.classList.contains("glow")) return;
    if (ensureEl("options").style.display === "none") {
      ensureEl("regenerate").style.display = "block";
      if (quickLang) {
        quickLang.style.display = "block";
        const langText = document.getElementById("quickLangText");
        if (langText) {
          try {
            const currentLang = (window as any).i18n?.getLanguage() || "en";
            langText.textContent = currentLang === "en" ? "RU" : "EN";
          } catch {}
        }
      }
    }
  });
  ensureEl("collapsible").addEventListener("mouseleave", () => {
    ensureEl("regenerate").style.display = "none";
    if (quickLang) quickLang.style.display = "none";
  });

  // Update quick lang toggle on language change
  window.addEventListener("language:changed", (e: any) => {
    const langText = document.getElementById("quickLangText");
    if (langText) {
      langText.textContent = e.detail.language === "en" ? "RU" : "EN";
    }
  });

  ensureEl("options")
    .querySelector("div.tab")
    ?.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target.tagName === "BUTTON") selectTab(target.id);
    });

  for (const id of ["options", "dialogs"]) {
    ensureEl(id).addEventListener("input", onPanelInput);
  }

  ensureEl("sticked").addEventListener("click", event => {
    const id = (event.target as HTMLElement).id;
    if (id === "newMapButton") regeneratePrompt();
    else if (id === "saveButton") showSavePane();
    else if (id === "exportButton") showExportPane();
    else if (id === "loadButton") void showLoadPane();
    else if (id === "zoomReset") resetZoom(1000);
    else if (id === "searchButton") Controllers.Omnibar.open();
  });

  ensureEl("viewMode").addEventListener("click", changeViewMode);
}

initialize();

// Legacy seam: the hotkeys and the About tab reach these by name from inline markup
declare global {
  // biome-ignore lint/suspicious/noRedeclare: legacy seam
  var toggleOptions: (event?: Event) => void;
  interface Window {
    showOptions: typeof showOptions;
    hideOptions: typeof hideOptions;
    selectStyleElement?: () => void;
  }
}
window.toggleOptions = toggleOptions;
window.showOptions = showOptions;
window.hideOptions = hideOptions;
