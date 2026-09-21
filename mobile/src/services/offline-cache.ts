// Offline support: tiles and the LightPack survive a dead Wi-Fi in IndexedDB, so the last
// viewed map stays available (with an "offline" badge) until the PC comes back.
import type { ApiStatus, LightPack } from "@/types/mobile-protocol";

const DB_NAME = "fmg-mobile";
const DB_VERSION = 1;
const TILE_STORE = "tiles";
const KV_STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TILE_STORE)) db.createObjectStore(TILE_STORE);
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function withStore<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

const tileKey = (seed: string, z: number, x: number, y: number): string => `${seed}/${z}/${x}/${y}`;

export const OfflineCache = {
  async getTile(seed: string, z: number, x: number, y: number): Promise<Blob | null> {
    try {
      return (await withStore<Blob | undefined>(TILE_STORE, "readonly", store => store.get(tileKey(seed, z, x, y)))) ?? null;
    } catch {
      return null;
    }
  },

  async putTile(seed: string, z: number, x: number, y: number, blob: Blob): Promise<void> {
    try {
      await withStore(TILE_STORE, "readwrite", store => store.put(blob, tileKey(seed, z, x, y)));
    } catch {
      // a full quota should never break online browsing
    }
  },

  /** A new map invalidates everything cached from the old one */
  async clearTiles(): Promise<void> {
    try {
      await withStore(TILE_STORE, "readwrite", store => store.clear());
    } catch {
      // ignore
    }
  },

  async saveSession(status: ApiStatus, pack: LightPack): Promise<void> {
    try {
      await withStore(KV_STORE, "readwrite", store => store.put(status, "status"));
      await withStore(KV_STORE, "readwrite", store => store.put(pack, "lightpack"));
    } catch {
      // quota - the map still works online
    }
  },

  async loadSession(): Promise<{ status: ApiStatus; pack: LightPack } | null> {
    try {
      const status = await withStore<ApiStatus | undefined>(KV_STORE, "readonly", store => store.get("status"));
      const pack = await withStore<LightPack | undefined>(KV_STORE, "readonly", store => store.get("lightpack"));
      return status && pack ? { status, pack } : null;
    } catch {
      return null;
    }
  }
};
