// Preload: the only bridge between the sandboxed page and the main process.
// Everything exposed here is a narrow, read-shaped API: the page can ask for a queued
// .map file and be told when one arrives, but it can never touch the filesystem itself
import { contextBridge, ipcRenderer } from "electron";

export type ElectronMapFile = { name: string; data: Uint8Array<ArrayBuffer> };

const MAP_FILE_CHANNEL = "fmg:open-map-file";

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
  }
});
