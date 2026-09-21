// Owns the mobile server inside the Electron main process. The renderer stays sandboxed, so the
// sockets live here and the map data flows over IPC: the renderer pushes status + LightPack and
// answers tile/detail requests, the phone talks to this process over the LAN.
import os from "node:os";
import { BrowserWindow, ipcMain, type WebContents } from "electron";
import { MobileServer, type MobileServerProviders } from "@/services/mobile-server/server";
import type { ApiStatus, BurgDetails, GenerateRequest, StateDetails } from "@/types/mobile-protocol";

const CHANNEL = "fmg:mobile-server";
const TILE_CACHE_LIMIT = 512;
const REQUEST_TIMEOUT_MS = 20_000;
const EMPTY_STATUS: Omit<ApiStatus, "app" | "protocol" | "version" | "hostname" | "ips" | "port" | "clients"> = {
  hasMap: false,
  mapName: "",
  seed: "",
  width: 0,
  height: 0,
  mapUpdatedAt: null,
  tiles: { template: "/api/tiles/{z}/{x}/{y}.png", minZoom: 0, maxZoom: 0 }
};

type RendererRequest = {
  id: number;
  type: "tile" | "getBurg" | "getState" | "command" | "getLightPack";
  payload: unknown;
};
type RendererResponse = { ok: true; result: unknown } | { ok: false; error: string };

export type MobileServerInfo = {
  running: boolean;
  port: number | null;
  clients: number;
  ips: string[];
  hostname: string;
};

/** LAN addresses a phone can reach; loopback last, if the machine has nothing else */
export function getLocalIPs(): string[] {
  const ips: string[] = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) ips.push(address.address);
    }
  }
  return ips.length ? ips : ["127.0.0.1"];
}

class MobileServerController {
  private server = new MobileServer();
  private mapState: Omit<ApiStatus, "app" | "protocol" | "version" | "hostname" | "ips" | "port" | "clients"> = {
    ...EMPTY_STATUS
  };
  private lightPack: string | null = null;
  private tileCache = new Map<string, { body: Uint8Array; contentType: string }>();
  private pending = new Map<number, (response: RendererResponse) => void>();
  private nextRequestId = 0;

  info(): MobileServerInfo {
    return {
      running: this.server.isRunning,
      port: this.server.isRunning ? this.server.port() : null,
      clients: this.server.clientCount,
      ips: getLocalIPs(),
      hostname: os.hostname()
    };
  }

  async start(config: { port: number; token: string }, version: string): Promise<{ port: number }> {
    if (this.server.isRunning) return { port: this.server.port() };

    const providers: MobileServerProviders = {
      getStatus: async () => ({
        ...this.mapState,
        app: "fantasy-map-generator",
        protocol: 1,
        version,
        hostname: os.hostname(),
        ips: getLocalIPs(),
        port: this.server.port(),
        clients: this.server.clientCount
      }),
      getLightPack: async () => {
        if (this.lightPack) return this.lightPack;
        const result = await this.requestRenderer<string>("getLightPack", null);
        return typeof result === "string" ? result : "{}";
      },
      getBurg: async id => (await this.requestRenderer<BurgDetails | null>("getBurg", { id })) ?? null,
      getState: async id => (await this.requestRenderer<StateDetails | null>("getState", { id })) ?? null,
      getTile: async (z, x, y, ext) => {
        const key = `${z}/${x}/${y}.${ext}`;
        const cached = this.tileCache.get(key);
        if (cached) return cached;
        const tile = await this.requestRenderer<{ body: Uint8Array | null; contentType: string } | null>("tile", {
          z,
          x,
          y,
          ext
        });
        if (!tile?.body) return null;
        this.tileCache.set(key, tile as { body: Uint8Array; contentType: string });
        if (this.tileCache.size > TILE_CACHE_LIMIT) {
          const oldest = this.tileCache.keys().next().value;
          if (oldest !== undefined) this.tileCache.delete(oldest);
        }
        return tile as { body: Uint8Array; contentType: string };
      },
      startGeneration: async (request: GenerateRequest) => {
        await this.requestRenderer("command", { action: "regenerate", payload: request });
      },
      onCommand: async (action, payload) => {
        await this.requestRenderer("command", { action, payload });
      },
      log: message => console.log(`[mobile] ${message}`)
    };

    return { port: await this.server.start(providers, { port: config.port, token: config.token }) };
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }

  /** The renderer pushes what changed on the map; the phones are told to reload */
  async publish(
    mapState: Omit<ApiStatus, "app" | "protocol" | "version" | "hostname" | "ips" | "port" | "clients">,
    lightPack: string | null
  ): Promise<void> {
    this.mapState = mapState;
    if (lightPack !== null) {
      this.lightPack = lightPack;
      this.tileCache.clear();
      this.server.publishLightPack().catch(() => undefined);
    }
    this.server.broadcast({ type: "map:updated", seed: mapState.seed, lightPackUrl: "/api/map/light" });
  }

  broadcastProgress(detail: { stepId: string; completed: number; total: number }): void {
    if (detail.total <= 0) return;
    this.server.broadcast({
      type: "generate:progress",
      stepId: detail.stepId,
      completed: detail.completed,
      total: detail.total,
      percent: Math.round((detail.completed / detail.total) * 100)
    });
  }

  broadcastGenerationError(message: string): void {
    this.server.broadcast({ type: "generate:error", message });
  }

  private get webContents(): WebContents | null {
    const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
    return window?.webContents ?? null;
  }

  private requestRenderer<T>(type: RendererRequest["type"], payload: unknown): Promise<T> {
    const webContents = this.webContents;
    if (!webContents) return Promise.reject(new Error("the app window is not available"));

    const id = ++this.nextRequestId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${type} request timed out`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, response => {
        clearTimeout(timer);
        if (response.ok) resolve(response.result as T);
        else reject(new Error(response.error));
      });

      try {
        webContents.send(`${CHANNEL}:request`, { id, type, payload } satisfies RendererRequest);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error as Error);
      }
    });
  }

  private resolvePending(id: number, response: RendererResponse): void {
    this.pending.get(id)?.(response);
    this.pending.delete(id);
  }

  attach(): void {
    ipcMain.on(`${CHANNEL}:response`, (_event, id: number, response: RendererResponse) =>
      this.resolvePending(id, response)
    );
  }
}

const controller = new MobileServerController();

export function initMobileServerIPC(): void {
  ipcMain.handle(`${CHANNEL}:info`, (): MobileServerInfo => controller.info());
  ipcMain.handle(`${CHANNEL}:start`, (_event, config: { port: number; token: string }, version: string) =>
    controller.start(config, version)
  );
  ipcMain.handle(`${CHANNEL}:stop`, () => controller.stop());
  ipcMain.handle(
    `${CHANNEL}:publish`,
    (
      _event,
      mapState: Omit<ApiStatus, "app" | "protocol" | "version" | "hostname" | "ips" | "port" | "clients">,
      lightPack: string | null
    ) => controller.publish(mapState, lightPack)
  );
  ipcMain.on(`${CHANNEL}:progress`, (_event, detail: { stepId: string; completed: number; total: number }) =>
    controller.broadcastProgress(detail)
  );
  ipcMain.on(`${CHANNEL}:generation-error`, (_event, message: string) => controller.broadcastGenerationError(message));
  controller.attach();
}

export function stopMobileServer(): Promise<void> {
  return controller.stop();
}
