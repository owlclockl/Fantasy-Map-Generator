// FMG Mobile entry: pair with the desktop app, show its map, drive it with commands.
// No generators are imported here - the phone only ever receives finished tiles and LightPack.
import "./style.css";
import "leaflet/dist/leaflet.css";
import type { ApiStatus, LightPack } from "@/types/mobile-protocol";
import { DetailsPanel } from "./components/details-panel";
import { createMapView, type MapViewController } from "./components/map-view";
import { PairingView } from "./components/pairing-view";
import { OfflineCache } from "./services/offline-cache";
import { PcClient, type ConnectionTarget } from "./services/pc-client";

const LANG = navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
const t = {
  connected: LANG === "ru" ? "на связи" : "live",
  offline: LANG === "ru" ? "офлайн — кэш" : "offline — cache",
  connecting: LANG === "ru" ? "подключение…" : "connecting…",
  cannotReach: LANG === "ru" ? "ПК недоступен" : "PC unreachable",
  regenerating: LANG === "ru" ? "ПК создаёт новую карту" : "PC is generating a new map",
  generateFailed: LANG === "ru" ? "Не удалось создать карту" : "generation failed",
  emptyMap: LANG === "ru" ? "На ПК нет карты — сгенерируйте её там" : "No map on the PC yet - generate one there"
};

const elements = {
  topbar: document.getElementById("topbar")!,
  topbarName: document.getElementById("topbarName")!,
  topbarStatus: document.getElementById("topbarStatus")!,
  mapView: document.getElementById("mapView")!,
  map: document.getElementById("map")!,
  btnDisconnect: document.getElementById("btnDisconnect")!,
  btnGenerate: document.getElementById("btnGenerate")!,
  btnLayers: document.getElementById("btnLayers")!,
  pairing: document.getElementById("pairingView")!,
  progress: document.getElementById("progressOverlay")!,
  progressText: document.getElementById("progressText")!,
  progressBar: document.getElementById("progressBar")!,
  details: document.getElementById("detailsSheet")!
};

let client: PcClient | null = null;
let mapController: MapViewController | null = null;
let pairingView: PairingView | null = null;
let detailsPanel: DetailsPanel | null = null;
let activeTarget: ConnectionTarget | null = null;
let offlineMode = false;
let progressTimer = 0;
let unbinders: (() => void)[] = [];

function showPairing(): void {
  elements.topbar.classList.add("hidden");
  elements.mapView.classList.add("hidden");
  elements.pairing.classList.remove("hidden");
  pairingView ??= new PairingView(elements.pairing, target => void connect(target));
  pairingView.reset();
}

function showMap(): void {
  elements.pairing.classList.add("hidden");
  elements.topbar.classList.remove("hidden");
  elements.mapView.classList.remove("hidden");
}

function setBadge(text: string, warn = false): void {
  elements.topbarStatus.textContent = text;
  elements.topbarStatus.classList.toggle("warn", warn);
}

async function connect(target: ConnectionTarget): Promise<void> {
  teardownSession();

  client = new PcClient(target);
  activeTarget = target;
  elements.topbarName.textContent = target.name || `${target.host}:${target.port}`;
  setBadge(t.connecting, true);
  showMap();

  // show what we have from the last session at once; it also becomes the offline fallback
  const cached = await OfflineCache.loadSession();
  if (cached && !mapController) {
    renderMap(cached.status, cached.pack, true);
    setBadge(t.offline, true);
  }

  try {
    await client.connect();
  } catch {
    mapController?.setOffline(true);
    if (cached) {
      offlineMode = true;
      setBadge(t.offline, true);
    } else {
      setBadge(t.cannotReach, true);
      setTimeout(showPairing, 1200);
    }
    return;
  }

  pairingView?.remember(target);
  bindClient();
  offlineMode = false;
  mapController?.setOffline(false);
  await loadMap();
}

function teardownSession(): void {
  unbinders.forEach(unbind => unbind());
  unbinders = [];
  client?.disconnect();
  client = null;
  mapController?.destroy();
  mapController = null;
  elements.details.classList.add("hidden");
}

function bindClient(): void {
  if (!client) return;
  unbinders = [
    client.on("map:updated", () => void loadMap()),
    client.on("progress", progress => {
      showProgress(progress.percent, progress.stepId);
    }),
    client.on("generation:error", () => {
      hideProgress();
      setBadge(t.generateFailed, true);
    }),
    client.on("close", () => {
      offlineMode = true;
      mapController?.setOffline(true);
      setBadge(t.offline, true);
      scheduleReconnect();
    })
  ];
}

/** The PC may just be restarting: quietly try again instead of dropping to the pairing screen */
function scheduleReconnect(): void {
  if (!activeTarget) return;
  window.setTimeout(() => {
    if (client?.state === "offline" && activeTarget) void connect(activeTarget);
  }, 4000);
}

async function loadMap(): Promise<void> {
  if (!client) return;
  try {
    const status = await client.fetchStatus();
    if (!status.hasMap) {
      setBadge(t.emptyMap, true);
      return;
    }
    const pack = await client.fetchLightPack();
    await OfflineCache.clearTiles();
    await OfflineCache.saveSession(status, pack);
    renderMap(status, pack, false);
    setBadge(t.connected);
  } catch (error) {
    console.error("cannot load the map", error);
    mapController?.setOffline(true);
    setBadge(t.offline, true);
  }
}

function renderMap(status: ApiStatus, pack: LightPack, cachedOnly: boolean): void {
  if (!mapController) {
    mapController = createMapView(elements.map, client!, {
      onBurgClick: burgId => void showBurgDetails(burgId),
      onOfflineTile: () => {
        offlineMode = true;
        mapController?.setOffline(true);
        setBadge(t.offline, true);
      }
    });
    detailsPanel ??= new DetailsPanel(elements.details, burgId => client?.sendCommand("focus", { burgId }), () => undefined);
  }
  mapController.render(status, pack);
  if (cachedOnly) mapController.setOffline(true);
}

async function showBurgDetails(burgId: number): Promise<void> {
  if (!client || offlineMode) return;
  try {
    detailsPanel?.showBurg(await client.fetchBurg(burgId));
  } catch {
    // the sheet simply stays as it was
  }
}

function showProgress(percent: number, stepId: string): void {
  clearTimeout(progressTimer);
  elements.progress.classList.remove("hidden");
  elements.progressText.textContent = `${t.regenerating}: ${stepId} (${percent}%)`;
  elements.progressBar.style.width = `${percent}%`;
  if (percent >= 100) progressTimer = window.setTimeout(hideProgress, 1500);
}

function hideProgress(): void {
  clearTimeout(progressTimer);
  elements.progress.classList.add("hidden");
  elements.progressBar.style.width = "0%";
}

elements.btnDisconnect.addEventListener("click", () => {
  teardownSession();
  activeTarget = null;
  showPairing();
});

elements.btnGenerate.addEventListener("click", () => {
  if (!client || offlineMode) return;
  void client.generate();
});

elements.btnLayers.addEventListener("click", () => {
  elements.map.classList.toggle("noOverlay");
});

showPairing();
