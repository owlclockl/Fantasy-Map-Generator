// Preload: the only bridge between the sandboxed page and the main process.
// Everything exposed here is a narrow, read-shaped API: the page can ask for a queued
// .map file and be told when one arrives, but it can never touch the filesystem itself
import { contextBridge, ipcRenderer } from "electron";

export type ElectronMapFile = { name: string; data: Uint8Array<ArrayBuffer> };

const MAP_FILE_CHANNEL = "fmg:open-map-file";
const MOBILE_CHANNEL = "fmg:mobile-server";

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  /** Pull the oldest queued .map file, if the main process has one waiting */
  getPendingMapFile: (): Promise<ElectronMapFile | null> => ipcRenderer.invoke(MAP_FILE_CHANNEL),
  /** Fired after `getPendingMapFile` gains something to return. Returns an unsubscribe function */
  onOpenMapFile: (listener: () => void): (() => void) => {
    const handler = () => listener();
    ipcRenderer.on(MAP_FILE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(MAP_FILE_CHANNEL, handler);
  },
  /**
   * The phone pairing server runs in the main process; the sandboxed page supplies the map data
   * through these calls and answers `onServerRequest` with tiles and map details
   */
  mobileServer: {
    info: (): Promise<{ running: boolean; port: number | null; clients: number; ips: string[]; hostname: string }> =>
      ipcRenderer.invoke(`${MOBILE_CHANNEL}:info`),
    start: (config: { port: number; token: string }, version: string): Promise<{ port: number }> =>
      ipcRenderer.invoke(`${MOBILE_CHANNEL}:start`, config, version),
    stop: (): Promise<void> => ipcRenderer.invoke(`${MOBILE_CHANNEL}:stop`),
    publish: (mapState: unknown, lightPack: string | null): Promise<void> =>
      ipcRenderer.invoke(`${MOBILE_CHANNEL}:publish`, mapState, lightPack),
    progress: (detail: { stepId: string; completed: number; total: number }): void =>
      ipcRenderer.send(`${MOBILE_CHANNEL}:progress`, detail),
    generationError: (message: string): void => ipcRenderer.send(`${MOBILE_CHANNEL}:generation-error`, message),
    /** The main process asks the page for tiles/details; reply by resolving the returned promise */
    onServerRequest: (
      handler: (request: { id: number; type: string; payload: unknown }) => Promise<unknown>
    ): (() => void) => {
      const listener = (_event: unknown, request: { id: number; type: string; payload: unknown }) => {
        Promise.resolve(handler(request))
          .then(result => ipcRenderer.send(`${MOBILE_CHANNEL}:response`, request.id, { ok: true, result }))
          .catch(error =>
            ipcRenderer.send(`${MOBILE_CHANNEL}:response`, request.id, {
              ok: false,
              error: String((error as Error)?.message ?? error)
            })
          );
      };
      ipcRenderer.on(`${MOBILE_CHANNEL}:request`, listener);
      return () => ipcRenderer.removeListener(`${MOBILE_CHANNEL}:request`, listener);
    }
  }
});
