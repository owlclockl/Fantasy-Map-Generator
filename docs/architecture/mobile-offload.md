# Mobile Offload: PC renders, phone displays

Big maps are painful on phones: ARM throttling, tight RAM, slow SVG DOM. The mobile offload flips
the responsibility - **the desktop app computes and renders everything, the phone is a thin client**
that receives finished raster tiles plus a small JSON summary. The phone never imports
`src/generators/*`, never builds SVG, and never holds the packed graph.

```
[Desktop app (Electron)]                        [Phone: mobile/ thin client]
  renderer (the usual FMG)                        Leaflet, CRS.Simple
    pack + grid + 30 pipeline steps               raster tiles  -> 256px PNG
    toLightPack()  ──── IPC ──┐                   LightPack     -> vector overlay (burgs,
    full-map raster ── IPC ──┤                                   rivers, routes, coastlines)
                              │                   WebSocket     -> progress, commands
  main process                │
    mobile-server.ts ─────────┴─> HTTP + WS on 0.0.0.0:8087
        MobileServer (src/services/mobile-server/server.ts)
        tile cache (Map, invalidated per map generation)
```

## Pieces

| Module | Role |
| --- | --- |
| `src/types/mobile-protocol.ts` | shared zod schemas (LightPack, ApiStatus, WS messages), pairing URI codec, Douglas-Peucker `simplifyPolyline` |
| `src/services/io/export-light.ts` | `toLightPack()` - burgs/states/rivers/routes/coastlines with simplified geometry, no grid, no cells |
| `src/services/mobile-server/ws-frames.ts` | dependency-free RFC 6455 codec (frames, masking, fragmentation, accept key) |
| `src/services/mobile-server/server.ts` | the transport: HTTP routes, WS sessions, rate limit, gzip. Node-only, provider-injected, unit-tested |
| `electron/mobile-server.ts` | main-process wiring: owns sockets, caches tiles, proxies data to/from the sandboxed renderer over IPC |
| `src/services/mobile-server/app.ts` | renderer side: builds LightPack on `map:generated`, renders tiles on demand, runs phone commands |
| `src/components/options/mobile-server-settings.ts` | Options tab section: start/stop, port, QR, connected devices |
| `mobile/` | Capacitor + Vite + Leaflet app (see `mobile/README.md`) |

## Data flow

1. Pairing: the Options tab shows a QR encoding `{ips, port, token, name}` (`fmvg://pair?data=...`).
   The token (40 random chars) is generated once per desktop install and lives in `localStorage`.
2. Map change: any `map:generated` event (generation, file load, transform, submap) pushes a fresh
   LightPack + map metadata to the main process, which broadcasts `map:updated` to phones and
   invalidates its tile cache.
3. Tile request: `GET /api/tiles/{z}/{x}/{y}.png` - the main process checks its cache, otherwise
   asks the renderer, which slices the cached full-map rasterization and returns PNG bytes.
4. Generation progress: the renderer forwards `generation:progress` events; phones show a progress
   bar. `POST /api/generate` (token required, rate limited) triggers `regenerateMap()` on the PC.
5. Phone commands over WS: `regenerate` (new map), `focus` (zoom the PC map to a burg),
   `getBurg`, `ping`.

## Tile scheme

A standard image pyramid on `CRS.Simple` with normalized coordinates: zoom `z` renders the map
`256 * 2^z` px wide; tile `(x, y)` counts from the top-left. Tile `(z, x, y)` is the map rectangle
`[x * W/2^z, y * H/2^z, W/2^z, H/2^z]` resized into 256×256. `minZoom 0` fits the whole map into
one tile; `maxZoom ≈ log2(W/256) + 1`. Phones overzoom two extra levels client-side.

## Security model (v1, LAN only)

- Reads (`/api/status`, `/api/map/light`, tiles, details) are open on the LAN - they contain map
  content only.
- Anything that drives the PC (`POST /api/generate`, the WS session) requires the pairing token.
- CORS `*` so a phone browser can fetch directly; the server binds `0.0.0.0` but is only started
  manually (or by `options.app.mobileServer.autoStart`), only in Electron, and is stopped with the app.
- Not for exposure to the internet - no TLS, no token rotation per session. Regenerating the code
  in Options kicks old clients.

## Testing it without Electron

`npm run mobile:demo` builds and starts a demo PC server that bundles the real `MobileServer`
transport with a procedural demo map (SVG tiles), on port 8087. Then in `mobile/`:
`npm install && npm run dev` and connect with the token the demo prints (leave the address empty in
dev - the vite proxy forwards `/api` and `/ws`).
