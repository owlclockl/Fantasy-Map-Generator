#!/usr/bin/env node

/**
 * The desktop app: one entry point for every Electron task.
 *
 *   npm run electron          run the app against the Vite dev server, with hot reload
 *   npm run electron build    compile the main process and the renderer into dist-electron/
 *   npm run electron dist     build, then package installers for this OS into release/
 *
 * Anything after `--` goes to electron-builder: `npm run electron -- dist --win --publish never`
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { build as viteBuild, createServer } from "vite";

const TSC = "node_modules/typescript/bin/tsc";
const ELECTRON = "node_modules/electron/cli.js";
const ELECTRON_BUILDER = "node_modules/electron-builder/cli.js";

const [task = "dev", ...builderArgs] = process.argv.slice(2);

function run(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("close", code => (code ? reject(new Error(`${script} exited with code ${code}`)) : resolve()));
  });
}

/** Main process and preload: typechecked by tsc, bundled to CommonJS by Vite */
async function buildMain() {
  await run(TSC, ["-p", "electron"]);
  await viteBuild({ configFile: "electron/vite.config.ts" });
}

/** The renderer is the same code the web build ships, and `vite build` alone would not typecheck it */
async function buildRenderer() {
  await run(TSC, ["--noEmit"]);
  await viteBuild({ mode: "electron" });
}

/**
 * The Windows installer wants an .ico, the repo carries a .png. A single PNG-compressed entry
 * is a valid icon since Vista, so wrap the PNG instead of committing a second binary.
 * A hand-made multi-size icon dropped at build/icon.ico always wins over the generated one
 */
function ensureWindowsIcon() {
  const pngPath = "build/icon.png";
  const icoPath = "build/icon.ico";
  if (existsSync(icoPath) || !existsSync(pngPath)) return;

  const png = readFileSync(pngPath);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // .ico type
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(width >= 256 ? 0 : width, 6); // 0 means 256 in icon directories
  header.writeUInt8(height >= 256 ? 0 : height, 7);
  header.writeUInt8(0, 8); // palette: none
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // image size
  header.writeUInt32LE(6 + 16, 18); // image offset
  writeFileSync(icoPath, Buffer.concat([header, png]));
  console.log("Windows icon generated: build/icon.ico");
}

async function dev() {
  await buildMain();

  const server = await createServer({ mode: "electron" });
  await server.listen();

  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite dev server did not report a local URL");
  console.log(`Electron renderer: ${url}`);

  await run(ELECTRON, ["."], { VITE_DEV_SERVER_URL: url });
  await server.close();
}

if (task === "dev") {
  await dev();
} else if (task === "build" || task === "dist") {
  await buildMain();
  await buildRenderer();
  if (task === "dist") {
    ensureWindowsIcon();
    await run(ELECTRON_BUILDER, builderArgs);
  }
} else {
  console.error(`Unknown task "${task}". Expected: dev, build or dist`);
  process.exit(1);
}
