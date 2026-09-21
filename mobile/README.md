# FMG Mobile

Thin client for the [Fantasy Map Generator](../README.md): the desktop app (Electron) generates and
renders the map and serves tiles over Wi-Fi; this app only displays them. No generators, no SVG
scene graph - Leaflet tiles plus a light vector overlay, with an offline cache of the last viewed map.

## What it shows

- The map as raster tiles served by the PC (`/api/tiles/{z}/{x}/{y}`).
- Burgs, states, rivers, routes and coastlines from the LightPack as a canvas overlay;
  tap a burg for details (population, state, culture, features).
- A "generate" button: asks the PC to make a new map and shows its pipeline progress live.
- Works offline with the cached last map (badge in the top bar).

## Pairing with the PC

1. In the desktop app open **Options → Mobile Server → Start server**. A QR code appears.
2. In the app, scan the QR (phone app only), paste the `fmvg://…` code, or type the PC address
   and pairing token by hand.
3. Both devices must be on the same network. The token lives in the desktop app's storage;
   regenerate it from Options to disconnect everything.

## Development (browser, no phone needed)

```bash
# repo root: start the demo PC server (real server transport + demo map, port 8087)
npm run mobile:demo

# in another terminal
cd mobile
npm install
npm run dev            # FMG_PC_URL=http://<pc-ip>:8087 npm run dev for a real PC
```

Open the printed URL, leave the address empty (dev requests go through the vite proxy to
`FMG_PC_URL`, default `http://localhost:8087`) and enter the pairing token the demo printed.

Connecting to a real desktop app in a desktop browser hits CORS-less http fine, but the page's
mixed-content rules may apply; the phone app (native webview with `cleartext: true`) is the target.

## Building the phone app (Capacitor)

```bash
cd mobile
npm run build
npx cap init FantasyMapMobile --web-dir dist   # already configured in capacitor.config.ts
npx cap add android                            # requires Android SDK
npx cap sync android
npx cap open android                           # build/install from Android Studio
```

`capacitor.config.ts` already sets `cleartext: true` so the native webview may talk to
`http://<pc>:8087` on the LAN. The QR scanner uses `@capacitor/barcode-scanner`; in a plain
browser the scan button explains itself and manual entry takes over.

## Architecture notes

See `docs/architecture/mobile-offload.md` in the repository. Key constraint for any change here:
**this app must never import `@/generators/*` or the renderers** - only `@/types/mobile-protocol`
(shared zod schemas and the pairing codec), so the phone bundle stays tiny and generation never
runs on the phone.
