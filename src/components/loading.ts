// The splash overlay shown while a map is being generated
// Enhanced with modern UI, i18n, and threading progress
import { select } from "d3";
import { i18n } from "@/services/i18n";

const fade = (id: string, opacity: number, duration: number) =>
  select(`#${id}`).transition().duration(duration).style("opacity", String(opacity));

export function showLoading(): void {
  fade("loading", 1, 200);
  fade("optionsContainer", 0, 100);
  fade("tooltip", 0, 200);

  // Update loading text based on language
  try {
    const loadingText = document.getElementById("loading-text");
    if (loadingText) {
      const lang = i18n.getLanguage();
      const text = lang === "ru" ? "ГЕНЕРАЦИЯ" : "GENERATING";
      loadingText.innerHTML = `${text}<span>.</span><span>.</span><span>.</span>`;
    }
  } catch {}

  // Show progress bar if available
  const progressContainer = document.getElementById("generationProgress");
  if (progressContainer) {
    progressContainer.style.display = "block";
  }
}

export function hideLoading(): void {
  fade("loading", 0, 3000);
  fade("optionsContainer", 1, 2000);
  fade("tooltip", 1, 3000);

  // Hide progress
  const progressContainer = document.getElementById("generationProgress");
  if (progressContainer) {
    progressContainer.style.display = "none";
  }

  // Restore loading text
  try {
    const loadingText = document.getElementById("loading-text");
    if (loadingText) {
      const dict = i18n.getDictionary();
      loadingText.innerHTML = `${dict.loading.text}<span>.</span><span>.</span><span>.</span>`;
    }
  } catch {}
}

export function updateLoadingProgress(stepId: string, percentage: number, useWorkers = false): void {
  const loadingText = document.getElementById("loading-text");
  if (loadingText) {
    try {
      const dict = i18n.getDictionary();
      const workerIcon = useWorkers ? "⚡" : "";
      loadingText.innerHTML = `${workerIcon} ${dict.loading.generating}: ${stepId} ${percentage}%<span>.</span><span>.</span><span>.</span>`;
    } catch {
      loadingText.textContent = `Generating: ${stepId} (${percentage}%)`;
    }
  }

  // Update progress bar if exists
  const progressBar = document.getElementById("generationProgressBar") as HTMLDivElement | null;
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }

  const progressText = document.getElementById("generationProgressText");
  if (progressText) {
    progressText.textContent = `${stepId} - ${percentage}%`;
  }
}

// Initialize progress bar in loading screen
export function initLoadingProgress(): void {
  const loading = document.getElementById("loading-typography");
  if (!loading) return;

  if (document.getElementById("generationProgress")) return;

  const progressContainer = document.createElement("div");
  progressContainer.id = "generationProgress";
  progressContainer.style.display = "none";
  progressContainer.style.marginTop = "1.5em";
  progressContainer.style.width = "100%";
  progressContainer.innerHTML = `
    <div style="background:rgba(255,255,255,0.2); border-radius:10px; height:6px; overflow:hidden; margin:10px 0">
      <div id="generationProgressBar" style="height:100%; width:0%; background:linear-gradient(90deg, #fff, #a5b4fc); border-radius:10px; transition:width 0.3s ease"></div>
    </div>
    <div id="generationProgressText" style="font-family:var(--font-mono, monospace); font-size:0.9em; opacity:0.8"></div>
  `;

  loading.appendChild(progressContainer);

  // Listen for generation progress events
  window.addEventListener("generation:progress", (e: any) => {
    const { stepId, percentage } = e.detail;
    const useWorkers = (() => {
      try {
        return (globalThis as any).options?.app?.ui?.threading?.enabled !== false;
      } catch {
        return false;
      }
    })();
    updateLoadingProgress(stepId, percentage, useWorkers);
  });
}

// Auto-init when DOM ready
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoadingProgress);
  } else {
    initLoadingProgress();
  }
}
