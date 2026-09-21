import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// In dev the page could talk to a PC directly, but browser CORS and https sandboxes make it easier
// to reach the PC through this dev server's proxy. Point FMG_PC_URL at the desktop app:
//   FMG_PC_URL=http://192.168.1.10:8087 npm run dev
const pcTarget = process.env.FMG_PC_URL ?? "http://localhost:8087";

export default defineConfig({
  resolve: {
    // shared protocol types live in the parent repo; only @/types/* may be imported here
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // a dev preview behind a forwarded host (e2b, ngrok, a LAN IP) must be reachable by name
    allowedHosts: true,
    proxy: {
      "/api": { target: pcTarget, changeOrigin: true },
      "/ws": { target: pcTarget, ws: true, changeOrigin: true }
    }
  },
  build: { target: "es2022", sourcemap: false }
});
