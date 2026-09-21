export type ElectronMapFile = { name: string; data: Uint8Array<ArrayBuffer> };

/** what the renderer tells the phone server about the map on screen; network fields are the main process' own */
export type ElectronMapState = {
  hasMap: boolean;
  mapName: string;
  seed: string;
  width: number;
  height: number;
  mapUpdatedAt: number | null;
  tiles: { template: string; minZoom: number; maxZoom: number };
};

export type ElectronServerRequest = {
  id: number;
  type: "tile" | "getBurg" | "getState" | "command" | "getLightPack";
  payload: unknown;
};

export type ElectronMobileServerApi = {
  info: () => Promise<{ running: boolean; port: number | null; clients: number; ips: string[]; hostname: string }>;
  start: (config: { port: number; token: string }, version: string) => Promise<{ port: number }>;
  stop: () => Promise<void>;
  publish: (mapState: ElectronMapState, lightPack: string | null) => Promise<void>;
  progress: (detail: { stepId: string; completed: number; total: number }) => void;
  generationError: (message: string) => void;
  onServerRequest: (handler: (request: ElectronServerRequest) => Promise<unknown>) => () => void;
};

export type ElectronBridge = {
  isElectron: true;
  platform: string;
  versions: { electron: string; chrome: string; node: string };
  /** Pull the oldest .map file queued by the main process, if there is one */
  getPendingMapFile?: () => Promise<ElectronMapFile | null>;
  /** Fired after `getPendingMapFile` gains something to return. Returns an unsubscribe function */
  onOpenMapFile?: (listener: () => void) => () => void;
  /** The phone pairing server bridge; present when the desktop build is new enough */
  mobileServer?: ElectronMobileServerApi;
};

export const isElectron = (): boolean => Boolean(window.electron?.isElectron);

export const isLocalhost = (): boolean => location.hostname === "localhost" || location.hostname === "127.0.0.1";

export const isProduction = (): boolean => Boolean(location.hostname) && !isLocalhost();

export const isMobile = (): boolean => window.innerWidth < 600 || Boolean(navigator.userAgentData?.mobile);

export const savedMessage = (name: string): string =>
  isElectron() ? `${name} is saved` : `${name} is saved. Open "Downloads" screen (CTRL + J) to check`;

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !isProduction() || isElectron()) return;

  const standalone = window.matchMedia("(display-mode: standalone)");
  const cacheOffline = (installed = false): void => {
    if (!installed && !standalone.matches && !navigator.standalone) return;
    if (!navigator.onLine) return;

    navigator.serviceWorker.ready
      .then(({ active }) => active?.postMessage({ type: "CACHE_OFFLINE" }))
      .catch(error => console.error("Offline caching request failed: ", error));
  };

  window.addEventListener("appinstalled", () => cacheOffline(true));
  window.addEventListener("online", () => cacheOffline());
  standalone.addEventListener("change", () => cacheOffline());
  navigator.serviceWorker.addEventListener("controllerchange", () => cacheOffline());

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => cacheOffline())
      .catch(error => console.error("ServiceWorker registration failed: ", error));
  });
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
  interface Navigator {
    userAgentData?: { mobile?: boolean };
    standalone?: boolean;
  }
}
