// The renderer's half of the phone offload: feeds the main-process server with LightPack and tiles,
// runs the commands phones send, and listens for map changes to keep the phones up to date.
// Loaded by the services registry on every platform; on the web every call is a no-op.
import { toLightPack } from "@/services/io/export-light";
import { type ElectronServerRequest, isElectron } from "@/services/platform";
import { VERSION } from "@/services/versioning";
import {
  type BurgDetails,
  encodePairingUri,
  MOBILE_DEFAULT_PORT,
  type PairingPayload,
  pairingWebSocketUrl,
  type StateDetails
} from "@/types/mobile-protocol";

const TOKEN_KEY = "mobileServerToken";
const TILE_SIZE = 256;
const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

type PairingInfo = {
  payload: PairingPayload;
  uri: string;
  urls: string[];
  port: number;
  clients: number;
};

class AppMobileServer {
  private running = false;
  private port: number | null = null;
  private info: { ips: string[]; hostname: string; clients: number } = { ips: [], hostname: "", clients: 0 };
  private mapUpdatedAt: number | null = null;
  private mapImage: HTMLImageElement | null = null;
  private mapImagePromise: Promise<HTMLImageElement> | null = null;
  private listeners = new Set<() => void>();
  private unsubscribeRequest: (() => void) | null = null;
  private pushTimer = 0;

  isAvailable(): boolean {
    return isElectron() && Boolean(window.electron?.mobileServer);
  }

  isRunning(): boolean {
    return this.running;
  }

  getPort(): number | null {
    return this.port;
  }

  getInfo() {
    return this.info;
  }

  /** Token is generated once per desktop install and shared with phones via the QR code */
  getToken(): string {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token || token.length < 32) {
      const bytes = crypto.getRandomValues(new Uint8Array(40));
      token = Array.from(bytes, byte => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]).join("");
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  }

  regenerateToken(): string {
    localStorage.removeItem(TOKEN_KEY);
    return this.getToken();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  async start(): Promise<void> {
    if (!this.isAvailable() || this.running) return;
    const api = window.electron!.mobileServer!;
    const port = options.app.mobileServer?.port ?? MOBILE_DEFAULT_PORT;
    this.unsubscribeRequest?.();
    this.unsubscribeRequest = api.onServerRequest(request => this.handleServerRequest(request));

    const { port: boundPort } = await api.start({ port, token: this.getToken() }, VERSION);
    this.port = boundPort;
    this.running = true;
    await this.refreshInfo();
    await this.pushMapState();
    this.notify();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    await window.electron!.mobileServer!.stop();
    this.running = false;
    this.port = null;
    this.unsubscribeRequest?.();
    this.unsubscribeRequest = null;
    this.notify();
  }

  async refreshInfo(): Promise<void> {
    const info = await window.electron!.mobileServer!.info();
    this.info = { ips: info.ips, hostname: info.hostname, clients: info.clients };
  }

  /** Everything a phone needs to pair: the QR payload and one ws:// url per LAN interface */
  async getPairingInfo(): Promise<PairingInfo | null> {
    if (!this.isAvailable()) return null;
    await this.refreshInfo();
    const port = this.port ?? options.app.mobileServer?.port ?? MOBILE_DEFAULT_PORT;
    const payload: PairingPayload = {
      v: 1,
      ips: this.info.ips,
      port,
      token: this.getToken(),
      name: this.info.hostname,
      version: VERSION
    };
    return {
      payload,
      uri: encodePairingUri(payload),
      urls: this.info.ips.map(ip => pairingWebSocketUrl(ip, port, payload.token)),
      port,
      clients: this.info.clients
    };
  }

  /**
   * Called on `map:generated` (generation, file load, transform, submap) and after Start.
   * Deferred a tick so the renderers have finished drawing the fresh map first
   */
  scheduleMapPush(): void {
    if (!this.running) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => void this.pushMapState(), 120);
  }

  async pushMapState(): Promise<void> {
    if (!this.running || !this.isAvailable() || !pack?.burgs) return;
    this.mapImage = null; // the rendered map on the server is stale from here on
    try {
      const lightPack = JSON.stringify(toLightPack(pack, this.lightPackMeta()));
      await window.electron!.mobileServer!.publish(this.mapState(), lightPack);
      this.mapUpdatedAt = Date.now();
    } catch (error) {
      console.error("Mobile server: cannot publish map state", error);
    }
  }

  private lightPackMeta() {
    return {
      seed: options.map.seed,
      name: options.map.lore.name || options.map.seed,
      width: options.map.graph.width,
      height: options.map.graph.height,
      version: VERSION,
      created: Date.now()
    };
  }

  private mapState() {
    return {
      hasMap: Boolean(pack?.burgs?.length),
      mapName: options.map.lore.name || options.map.seed,
      seed: options.map.seed,
      width: options.map.graph.width,
      height: options.map.graph.height,
      mapUpdatedAt: this.mapUpdatedAt,
      tiles: {
        template: "/api/tiles/{z}/{x}/{y}.png",
        minZoom: 0,
        maxZoom: this.maxZoom()
      }
    };
  }

  /** zoom 0 fits the map into one 256px tile; native resolution sits around log2(width/256) */
  private maxZoom(): number {
    const native = Math.log2(options.map.graph.width / TILE_SIZE);
    return Math.min(6, Math.max(1, Math.ceil(native) + 1));
  }

  // ---------------------------------------------------------------------------
  // Serving the main process' requests
  // ---------------------------------------------------------------------------

  private async handleServerRequest(request: ElectronServerRequest): Promise<unknown> {
    switch (request.type) {
      case "tile": {
        const { z, x, y, ext } = request.payload as { z: number; x: number; y: number; ext: string };
        return this.renderTile(z, x, y, ext);
      }
      case "getLightPack":
        return JSON.stringify(toLightPack(pack, this.lightPackMeta()));
      case "getBurg":
        return this.burgDetails((request.payload as { id: number }).id);
      case "getState":
        return this.stateDetails((request.payload as { id: number }).id);
      case "command":
        return this.runCommand(request.payload as { action: string; payload: unknown });
      default:
        throw new Error(`unknown request type: ${request.type as string}`);
    }
  }

  /**
   * Slice one tile out of the full-map rasterization. Tile z/x/y is a standard image pyramid:
   * zoom z shows the map 2^z * 256 px wide; (x, y) counts tiles from the top-left corner
   */
  private async renderTile(
    z: number,
    x: number,
    y: number,
    ext: string
  ): Promise<{ body: Uint8Array | null; contentType: string }> {
    if (ext !== "png" || z < 0 || x < 0 || y < 0) return { body: null, contentType: "" };
    const maxTiles = 2 ** z;
    if (x >= maxTiles || y >= Math.ceil((maxTiles * options.map.graph.height) / options.map.graph.width)) {
      return { body: null, contentType: "" };
    }

    const image = await this.ensureMapImage();
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return { body: null, contentType: "" };

    const mapWidth = options.map.graph.width;
    const mapHeight = options.map.graph.height;
    const sourceWidth = mapWidth / maxTiles;
    const sourceHeight = mapHeight / maxTiles;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, x * sourceWidth, y * sourceHeight, sourceWidth, sourceHeight, 0, 0, TILE_SIZE, TILE_SIZE);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) return { body: null, contentType: "" };
    return { body: new Uint8Array(await blob.arrayBuffer()), contentType: "image/png" };
  }

  private ensureMapImage(): Promise<HTMLImageElement> {
    if (this.mapImage) return Promise.resolve(this.mapImage);
    this.mapImagePromise ??= Services.ExportMap.getMapURL("png", {
      fullMap: true,
      noScaleBar: true,
      noVignette: true
    }).then(
      url =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            this.mapImage = image;
            this.mapImagePromise = null;
            resolve(image);
          };
          image.onerror = () => {
            this.mapImagePromise = null;
            reject(new Error("cannot rasterize the map"));
          };
          image.src = url;
        })
    );
    return this.mapImagePromise;
  }

  private burgDetails(id: number): BurgDetails | null {
    const burg = pack.burgs[id];
    if (!burg || burg.removed) return null;
    const state = pack.states[burg.state ?? 0];
    const culture = burg.culture !== undefined ? pack.cultures[burg.culture] : undefined;
    return {
      i: burg.i,
      name: burg.name ?? "",
      x: burg.x,
      y: burg.y,
      population: burg.population ?? 0,
      state: burg.state ?? 0,
      stateName: state?.name,
      culture: burg.culture,
      cultureName: culture?.name,
      capital: Boolean(burg.capital) || undefined,
      port: Boolean(burg.port) || undefined,
      features: {
        walls: Boolean(burg.walls),
        citadel: Boolean(burg.citadel),
        plaza: Boolean(burg.plaza),
        temple: Boolean(burg.temple),
        shanty: Boolean(burg.shanty)
      }
    };
  }

  private stateDetails(id: number): StateDetails | null {
    const state = pack.states[id];
    if (!state || state.i === 0 || state.removed) return null;
    return {
      i: state.i,
      name: state.name,
      fullName: state.fullName,
      formName: state.formName,
      color: state.color ?? "#969696",
      capital: state.capital,
      area: state.area ?? 0,
      population: Math.round((state.rural ?? 0) + (state.urban ?? 0)),
      rural: Math.round(state.rural ?? 0),
      urban: Math.round(state.urban ?? 0),
      burgs: state.burgs ?? 0,
      neighbors: state.neighbors?.filter(id => id > 0)
    };
  }

  private async runCommand(command: { action: string; payload: unknown }): Promise<{ ok: boolean }> {
    if (command.action === "regenerate") {
      // dynamic imports keep the lifecycle/zoom modules out of this service's import cycle
      const { regenerateMap } = await import("@/components/lifecycle");
      const { seed, width, height } = (command.payload ?? {}) as { seed?: string; width?: number; height?: number };
      const config: { seed?: string; width?: number; height?: number } = {};
      if (seed) config.seed = seed;
      if (width) config.width = width;
      if (height) config.height = height;
      regenerateMap(config);
      return { ok: true };
    }
    if (command.action === "focus") {
      const burgId = (command.payload as { burgId?: number } | null)?.burgId;
      const burg = pack.burgs[burgId ?? -1];
      if (!burg) throw new Error(`burg ${burgId} not found`);
      const { zoomTo } = await import("@/components/zoom");
      zoomTo(burg.x, burg.y, 8, 1500);
      return { ok: true };
    }
    throw new Error(`unknown command: ${command.action}`);
  }
}

export const MobileServer = new AppMobileServer();

// Subscribed here rather than from the lifecycle, so the module stays optional for every caller:
// on the web nothing is available and every callback is a no-op, on desktop this is the only
// place that watches the map and mirrors it to the phones
if (typeof window !== "undefined") {
  window.addEventListener("map:generated", () => {
    MobileServer.scheduleMapPush();
    if (options.app.mobileServer?.autoStart && MobileServer.isAvailable() && !MobileServer.isRunning()) {
      MobileServer.start().catch(error => console.error("Mobile server auto-start failed", error));
    }
  });

  window.addEventListener("generation:progress", event => {
    if (!MobileServer.isRunning()) return;
    window.electron?.mobileServer?.progress((event as CustomEvent).detail);
  });
}
