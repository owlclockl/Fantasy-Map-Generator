// Bundles the demo PC server (real MobileServer transport + demo map) into one runnable file
import { fileURLToPath } from "node:url";

export default {
  input: fileURLToPath(new URL("./main.ts", import.meta.url)),
  output: { file: fileURLToPath(new URL("./server.build.mjs", import.meta.url)), format: "esm" },
  platform: "node",
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  external: [/^node:/]
};
