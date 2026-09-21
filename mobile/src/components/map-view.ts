// The Leaflet view: raster tiles from the PC plus a light vector overlay for interaction.
// CRS.Simple with normalized [0..256] coordinates, so the standard {z}/{x}/{y} image pyramid
// (zoom 0 = the whole map in one 256px tile) maps 1:1 onto what the PC serves.
import L from "leaflet";
import type { ApiStatus, LightPack } from "@/types/mobile-protocol";
import { OfflineCache } from "../services/offline-cache";
import type { PcClient } from "../services/pc-client";

/** map units -> normalized latlng units */
const toLatLng = (status: ApiStatus, x: number, y: number): L.LatLngExpression => [
  (y * 256) / status.height,
  (x * 256) / status.width
];

const CachedTileLayer = L.TileLayer.extend({
  client: null as PcClient | null,
  seed: "",
  ext: "png",
  urls: new Map<string, string>(),

  createTile(coords: L.Coords, done: (error?: Error, tile?: HTMLElement) => void): HTMLElement {
    const tile = document.createElement("img");
    tile.alt = "";
    const key = `${coords.z}/${coords.x}/${coords.y}`;

    void (async () => {
      let blob = await OfflineCache.getTile(this.seed, coords.z, coords.x, coords.y);
      if (!blob) {
        blob = await this.client?.fetchTile(coords.z, coords.x, coords.y, this.ext);
        if (blob) await OfflineCache.putTile(this.seed, coords.z, coords.x, coords.y, blob);
      }
      if (!blob) {
        done(new Error(`tile ${key} not available`), tile);
        return;
      }
      const url = URL.createObjectURL(blob);
      this.urls.set(key, url);
      L.DomEvent.on(tile, "load", () => done(undefined, tile));
      L.DomEvent.on(tile, "error", () => done(new Error(`tile ${key} broken`), tile));
      tile.src = url;
    })();

    return tile;
  },

  /** blob urls die with their tiles, otherwise the map leaks them on every pan */
  _removeTile(key: string): void {
    const url = this.urls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(key);
    }
    (L.TileLayer.prototype as unknown as { _removeTile: (key: string) => void })._removeTile.call(this, key);
  }
});

export type MapViewCallbacks = {
  onBurgClick(burgId: number): void;
  onOfflineTile(): void;
};

export type MapViewController = {
  render(status: ApiStatus, pack: LightPack): void;
  setOffline(offline: boolean): void;
  focusBurg(burgId: number): void;
  destroy(): void;
};

export function createMapView(container: HTMLElement, client: PcClient, callbacks: MapViewCallbacks): MapViewController {
  const map = L.map(container, {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: 6,
    zoomSnap: 0.25,
    attributionControl: false,
    preferCanvas: true
  });

  let tileLayer: L.TileLayer | null = null;
  let overlay: L.LayerGroup | null = null;
  let currentStatus: ApiStatus | null = null;
  let currentPack: LightPack | null = null;
  let offline = false;

  function render(status: ApiStatus, pack: LightPack): void {
    currentStatus = status;
    currentPack = pack;
    const ext = status.tiles.template.split(".").pop() ?? "png";
    const bounds = L.latLngBounds([0, 0], [256, (256 * status.height) / status.width]);

    if (!tileLayer) {
      tileLayer = new (CachedTileLayer as unknown as new (url: string, options: L.TileLayerOptions) => L.TileLayer)(
        status.tiles.template,
        {
          tileSize: 256,
          minZoom: Math.min(0, status.tiles.minZoom),
          maxZoom: status.tiles.maxZoom + 2, // overzoom past what the PC renders natively
          maxNativeZoom: status.tiles.maxZoom,
          bounds,
          updateWhenIdle: true,
          keepBuffer: 1,
          className: "mapTiles"
        } as L.TileLayerOptions
      );
      (tileLayer as unknown as { client: PcClient; seed: string; ext: string }).client = client;
      (tileLayer as unknown as { seed: string }).seed = status.seed;
      (tileLayer as unknown as { ext: string }).ext = ext;
      tileLayer.on("tileerror", () => offline && callbacks.onOfflineTile());
      tileLayer.addTo(map);
    } else {
      (tileLayer as unknown as { seed: string }).seed = status.seed;
      (tileLayer as unknown as { options: L.TileLayerOptions }).options.maxNativeZoom = status.tiles.maxZoom;
      tileLayer.redraw();
    }

    overlay?.remove();
    overlay = L.layerGroup().addTo(map);
    drawOverlay(status, pack);
    map.setMaxBounds(bounds.pad(0.2));
    map.invalidateSize();
    map.fitBounds(bounds);
  }

  function drawOverlay(status: ApiStatus, pack: LightPack): void {
    if (!overlay) return;
    const canvas = L.canvas({ padding: 0.5 });

    for (const coastline of pack.coastlines) {
      L.polyline(coastline.map(point => toLatLng(status, point[0], point[1])), {
        renderer: canvas,
        color: "#4c6a92",
        weight: 1.2,
        opacity: 0.9,
        interactive: false,
        noClip: true
      }).addTo(overlay);
    }

    for (const river of pack.rivers) {
      L.polyline(river.points.map(point => toLatLng(status, point[0], point[1])), {
        renderer: canvas,
        color: "#5b93c6",
        weight: Math.min(4, 0.8 + river.width),
        opacity: 0.85,
        interactive: false,
        noClip: true
      }).addTo(overlay);
    }

    for (const route of pack.routes) {
      L.polyline(route.points.map(point => toLatLng(status, point[0], point[1])), {
        renderer: canvas,
        color: "#8a6d4b",
        weight: 1,
        opacity: 0.7,
        dashArray: "3 3",
        interactive: false,
        noClip: true
      }).addTo(overlay);
    }

    const stateColors = new Map(pack.states.map(state => [state.i, state.color]));
    for (const burg of pack.burgs) {
      const radius = Math.min(7, 2 + Math.log10(Math.max(10, burg.population)));
      const marker = L.circleMarker(toLatLng(status, burg.x, burg.y), {
        renderer: canvas,
        radius: burg.capital ? radius + 1.5 : radius,
        color: burg.capital ? "#f5d76e" : "#2b1d16",
        weight: burg.capital ? 1.6 : 0.8,
        fillColor: stateColors.get(burg.state) ?? "#c96f4a",
        fillOpacity: 0.95,
        burgId: burg.i
      } as unknown as L.CircleMarkerOptions);
      marker.bindTooltip(burg.name, { direction: "top", offset: [0, -6] });
      marker.on("click", () => callbacks.onBurgClick(burg.i));
      marker.addTo(overlay);
    }
  }

  function setOffline(value: boolean): void {
    offline = value;
    container.classList.toggle("offline", value);
  }

  function focusBurg(burgId: number): void {
    const burg = currentPack?.burgs.find(candidate => candidate.i === burgId);
    if (!burg || !currentStatus) return;
    map.flyTo(toLatLng(currentStatus, burg.x, burg.y), Math.max(map.getZoom(), 2.5), { duration: 0.8 });
  }

  function destroy(): void {
    map.remove();
  }

  return { render, setOffline, focusBurg, destroy };
}
