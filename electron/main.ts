// Electron main process: serves the built renderer over a custom scheme and owns the app window

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { MenuItemConstructorOptions } from "electron";
import {
  app,
  type BaseWindow,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  shell
} from "electron";
import { initMobileServerIPC, stopMobileServer } from "./mobile-server";
import { checkForUpdatesNow, initUpdater } from "./updater";

const SCHEME = "app";
const HOST = "fmg";
const APP_URL = `${SCHEME}://${HOST}/index.html`;
const RENDERER_DIR = path.join(__dirname, "renderer");
const ICON_PATH = path.join(__dirname, "icon.png");
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const WIKI_URL = "https://github.com/Azgaar/Fantasy-Map-Generator/wiki";
const DISCORD_URL = "https://discord.gg/X7E84HU";
const BUG_REPORT_URL = "https://github.com/Azgaar/Fantasy-Map-Generator/issues/new?template=bug_report.yml";
const PERF_TIPS_URL = `${WIKI_URL}/Q&A#the-map-performance-is-poor-how-can-i-improve-it`;

/** Renderer notification: a .map file was queued, ask for it via `fmg:get-pending-map-file` */
const MAP_FILE_CHANNEL = "fmg:open-map-file";

/**
 * The app is named after `productName`, but its data stays in the folder the name would have
 * produced before, so a rename never strands the maps stored in localStorage and IndexedDB
 */
app.setPath("userData", path.join(app.getPath("appData"), "fantasy-map-generator"));

// Windows groups taskbar icons and notifications by this id; without it the app shows as "Electron"
if (process.platform === "win32") app.setAppUserModelId("com.azgaar.fantasy-map-generator");

app.setAboutPanelOptions({
  applicationName: app.name,
  applicationVersion: app.getVersion(),
  iconPath: ICON_PATH,
  copyright: "MIT License. Azgaar and Team, 2017-2026"
});

// ---------------------------------------------------------------------------
// Performance: GPU rendering and no background throttling.
// Everything here only removes slowness, never features.
// ---------------------------------------------------------------------------

type PerformanceConfig = { hardwareAcceleration: boolean };

const DEFAULT_PERFORMANCE: PerformanceConfig = { hardwareAcceleration: true };
const perfFile = () => path.join(app.getPath("userData"), "performance.json");

function readPerformanceConfig(): PerformanceConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(perfFile(), "utf8")) as Partial<PerformanceConfig>;
    return { hardwareAcceleration: parsed.hardwareAcceleration !== false };
  } catch {
    return DEFAULT_PERFORMANCE;
  }
}

function writePerformanceConfig(config: PerformanceConfig): void {
  try {
    fs.writeFileSync(perfFile(), JSON.stringify(config));
  } catch (error) {
    console.error("Cannot store performance settings:", error);
  }
}

/** Must run before `app.ready`: Chromium reads its switches only at startup */
function applyPerformanceSwitches(): void {
  const { hardwareAcceleration } = readPerformanceConfig();

  // FMG_DISABLE_GPU=1 is the escape hatch for broken drivers, no UI needed
  if (!hardwareAcceleration || process.env.FMG_DISABLE_GPU === "1") {
    app.commandLine.appendSwitch("disable-gpu");
  } else {
    // the map is a huge SVG scene: rasterize and composite it on the GPU
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    app.commandLine.appendSwitch("enable-zero-copy");
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
  }

  // generation runs for minutes and must not stall when the window loses focus
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
}

applyPerformanceSwitches();

// ---------------------------------------------------------------------------
// Window state
// ---------------------------------------------------------------------------

type WindowState = { width: number; height: number; x?: number; y?: number; maximized: boolean; fullscreen: boolean };

// the map only reads well at size, so a first run takes the whole screen; later runs honour what the user left
const DEFAULT_STATE: WindowState = { width: 1440, height: 900, maximized: false, fullscreen: true };

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function readState(): WindowState {
  try {
    const { width, height, x, y, maximized, fullscreen } = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (!width || !height) return DEFAULT_STATE;
    return fitToDisplay({ width, height, x, y, maximized: Boolean(maximized), fullscreen: Boolean(fullscreen) });
  } catch {
    return DEFAULT_STATE;
  }
}

/** A window restored onto a monitor that is no longer attached would open out of sight: keep it on a real display */
function fitToDisplay(state: WindowState): WindowState {
  if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) return { ...state, x: undefined, y: undefined };

  const { x = 0, y = 0 } = state;
  const { workArea } = screen.getDisplayMatching({ x, y, width: state.width, height: state.height });
  const width = Math.min(state.width, workArea.width);
  const height = Math.min(state.height, workArea.height);

  return {
    ...state,
    width,
    height,
    x: Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - height)
  };
}

function saveState(window: BrowserWindow): void {
  try {
    // getNormalBounds is the un-maximized size, the one to restore to when the user unmaximizes
    const state = { ...window.getNormalBounds(), maximized: window.isMaximized(), fullscreen: window.isFullScreen() };
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch (error) {
    console.error("Cannot store window state:", error);
  }
}

// ---------------------------------------------------------------------------
// Renderer serving
// ---------------------------------------------------------------------------

/**
 * The renderer is an ES module app, and Chromium refuses to load modules from file://,
 * so the build is served from a privileged scheme that gives the page a real origin
 * (required by localStorage and IndexedDB the app stores maps in)
 */
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }
]);

/**
 * A .map file is shared like a document, and the app builds markup out of what is inside it, so the one
 * directive that matters is `script-src`: no external origin may supply code. The rest stays permissive,
 * because maps embed data/blob images and fonts and the AI providers are fetched over https. `unsafe-eval`
 * is required by the goods distribution formulas, which compile to `new Function`
 */
const CSP = [
  "default-src 'self' data: blob:",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' data: https:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob: https: wss:",
  "frame-src 'self' https:"
].join("; ");

function serveRenderer(): void {
  protocol.handle(SCHEME, async request => {
    const { host, pathname } = new URL(request.url);
    if (host !== HOST) return new Response("Not found", { status: 404 });

    let filePath: string;
    try {
      // a directory holds no file to serve: hand out the app itself, the way a web server would
      const requestedPath = decodeURIComponent(pathname);
      filePath = path.join(RENDERER_DIR, requestedPath.endsWith("/") ? `${requestedPath}index.html` : requestedPath);
    } catch {
      return new Response("Bad request", { status: 400 }); // a malformed percent-escape
    }
    if (!filePath.startsWith(RENDERER_DIR + path.sep)) return new Response("Forbidden", { status: 403 });

    try {
      const response = await net.fetch(pathToFileURL(filePath).toString());
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", CSP);
      // the bundle is content-hashed, so every restart revalidates for free; only the entry stays fresh
      headers.set(
        "Cache-Control",
        filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable"
      );
      return new Response(response.body, { status: response.status, headers });
    } catch {
      // net.fetch rejects on a missing file, and the rejection would reach the page as an opaque network error
      return new Response("Not found", { status: 404 });
    }
  });
}

/** Keep the app itself in the window, hand every external link to the default browser */
function routeExternalLinks(window: BrowserWindow): void {
  const openExternal = (url: string) => {
    if (/^(https?|mailto):/.test(url)) void shell.openExternal(url);
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url === window.webContents.getURL()) return; // in-app reload
    event.preventDefault();
    openExternal(url);
  });
}

/**
 * The browser console is part of how the map is debugged, so the packaged app keeps it: the View menu
 * has the toggle, and these shortcuts work even where the menu bar is hidden
 */
function enableDevTools(window: BrowserWindow): void {
  const { webContents } = window;

  webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const isF12 = input.key === "F12";
    const isInspectCombo = (input.control || input.meta) && input.shift && input.key.toLowerCase() === "i";
    if (isF12 || isInspectCombo) webContents.toggleDevTools();
  });

  // a desktop window has no browser context menu of its own: supply editing commands and the inspector
  webContents.on("context-menu", (_event, { x, y, isEditable, selectionText }) => {
    const template: MenuItemConstructorOptions[] = [];
    if (isEditable) template.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { type: "separator" });
    else if (selectionText) template.push({ role: "copy" }, { type: "separator" });
    template.push({ label: "Inspect element", click: () => webContents.inspectElement(x, y) });

    Menu.buildFromTemplate(template).popup({ window });
  });
}

// ---------------------------------------------------------------------------
// .map files: double-click in Explorer, File menu, or a second launch with a path
// ---------------------------------------------------------------------------

type QueuedMapFile = { name: string; data: Buffer };

/** Files wait here until the renderer asks; a queue, so rapid arrivals each get loaded in turn */
const pendingMapFiles: QueuedMapFile[] = [];

ipcMain.handle(MAP_FILE_CHANNEL, () => pendingMapFiles.shift() ?? null);

function isMapFile(filePath: string): boolean {
  return /\.map$/i.test(filePath.trim());
}

/** argv[0] is the exe itself; argv[1] may be the opened file (or "." in dev) */
function collectMapFileFromArgv(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg === "." || arg.startsWith("-")) continue;
    if (isMapFile(arg)) return arg;
  }
  return null;
}

function notifyMapFileQueued(): void {
  // the event carries no payload: the renderer pulls the file itself, so nothing is lost
  // when the page is still loading or the subscription is not attached yet
  const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
  window?.webContents.send(MAP_FILE_CHANNEL);
}

async function intakeMapFile(filePath: string): Promise<void> {
  if (!isMapFile(filePath)) return;
  try {
    const data = await fs.promises.readFile(filePath);
    pendingMapFiles.push({ name: path.basename(filePath), data });
    notifyMapFileQueued();
  } catch (error) {
    console.error("Cannot open map file:", error);
    dialog.showErrorBox(
      "Cannot open map file",
      `The file could not be read:\n${filePath}\n\n${(error as Error).message}`
    );
  }
}

/**
 * Menu clicks hand over a `BaseWindow`, which has no webContents; narrow it to the
 * BrowserWindow it is at runtime, falling back to the live window when there is none
 */
function pickWindow(window?: BrowserWindow | BaseWindow): BrowserWindow | undefined {
  if (window instanceof BrowserWindow) return window;
  return BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
}

async function openMapFileDialog(window?: BrowserWindow | BaseWindow): Promise<void> {
  const target = pickWindow(window);
  const { canceled, filePaths } = target
    ? await dialog.showOpenDialog(target, {
        title: "Open map file",
        filters: [{ name: "Fantasy Map Generator maps", extensions: ["map"] }],
        properties: ["openFile"]
      })
    : { canceled: true as const, filePaths: [] as string[] };
  if (canceled || !filePaths.length) return;
  await intakeMapFile(filePaths[0]);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/**
 * The default menu offers Reload, which throws the map away without the browser's "leave site?" prompt.
 * This one asks first, and keeps what the app needs: the Edit roles carry the clipboard shortcuts on macOS
 */
function reloadSafely(window?: BrowserWindow | BaseWindow): void {
  const target = pickWindow(window);
  if (!target || target.isDestroyed()) return;
  dialog
    .showMessageBox(target, {
      type: "question",
      buttons: ["Reload", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Reload",
      message: "Reload the app?",
      detail: "Unsaved changes will be lost. The map is autosaved to the app storage, but save it to a file to be safe"
    })
    .then(({ response }) => {
      if (response === 0 && !target.isDestroyed()) target.webContents.reload();
    });
}

function setHardwareAcceleration(enabled: boolean): void {
  writePerformanceConfig({ hardwareAcceleration: enabled });
  buildMenu(); // refresh the checkbox state

  const target = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
  const box = target
    ? dialog.showMessageBox(target, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Restart required",
        message: `Hardware acceleration ${enabled ? "will be enabled" : "will be disabled"} after restart`,
        detail: "Save the map to a file before restarting"
      })
    : dialog.showMessageBox({
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Restart required",
        message: `Hardware acceleration ${enabled ? "will be enabled" : "will be disabled"} after restart`
      });
  box.then(({ response }) => {
    if (response !== 0) return;
    skipConfirmation = true;
    app.relaunch();
    app.quit();
  });
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const { hardwareAcceleration } = readPerformanceConfig();

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? ([{ role: "appMenu" }] satisfies MenuItemConstructorOptions[]) : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Map File…",
          accelerator: "CmdOrCtrl+O",
          click: (_item, window) => void openMapFileDialog(window)
        },
        { type: "separator" },
        { label: "Show User Data Folder", click: () => void shell.openPath(app.getPath("userData")) },
        { type: "separator" },
        ...(isMac
          ? ([{ role: "close" }] satisfies MenuItemConstructorOptions[])
          : ([{ role: "quit" }] satisfies MenuItemConstructorOptions[]))
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: (_item, window) => reloadSafely(window) },
        {
          label: "Force Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          click: (_item, window) => {
            if (window instanceof BrowserWindow) window.webContents.reloadIgnoringCache();
          }
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        {
          label: "Performance",
          submenu: [
            {
              label: "Hardware Acceleration",
              type: "checkbox",
              checked: hardwareAcceleration,
              toolTip: "Render the map on the GPU. Takes effect after restart",
              click: item => setHardwareAcceleration(item.checked)
            },
            { label: "Performance Tips", click: () => void shell.openExternal(PERF_TIPS_URL) }
          ]
        },
        { type: "separator" },
        { role: "toggleDevTools" }
      ]
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Wiki & Documentation", click: () => void shell.openExternal(WIKI_URL) },
        { label: "Discord Community", click: () => void shell.openExternal(DISCORD_URL) },
        { label: "Report a Bug", click: () => void shell.openExternal(BUG_REPORT_URL) },
        { type: "separator" },
        { label: "Check for Updates…", click: () => checkForUpdatesNow() },
        ...(isMac ? [] : ([{ type: "separator" }, { role: "about" }] satisfies MenuItemConstructorOptions[]))
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let quitting = false; // set on Cmd+Q, where closing the window alone would leave the app running
let skipConfirmation = false; // set once the user has confirmed, and by the updater to install on restart

app.on("before-quit", () => {
  quitting = true;
});

/** Closes the window without the quit confirmation, so the installer can restart the app */
function allowClose(): void {
  skipConfirmation = true;
}

/**
 * The web app warns before navigating away via `onbeforeunload`, but Electron cancels the close
 * silently instead of prompting, which would make the window unclosable. Ask natively instead
 */
function confirmOnClose(window: BrowserWindow): void {
  let confirming = false;

  window.on("close", event => {
    saveState(window);
    if (skipConfirmation) return;
    event.preventDefault();
    // Cmd+Q reaches the window through before-quit as well as the close itself, and a window
    // manager binding can deliver it more than once; without this the dialog stacks on itself
    if (confirming) return;
    confirming = true;

    dialog
      .showMessageBox(window, {
        type: "question",
        buttons: ["Quit", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Quit",
        message: "Quit the Fantasy Map Generator?",
        detail: "The map is autosaved to the app storage, but save it to a file to be safe"
      })
      .then(({ response }) => {
        confirming = false;
        if (response !== 0) {
          quitting = false;
          return;
        }
        skipConfirmation = true;
        if (quitting) app.quit();
        else window.close();
      });
  });

  // on macOS the app outlives its window: the next one has to ask again
  window.on("closed", () => {
    skipConfirmation = false;
  });
}

/**
 * A huge map can freeze or crash the renderer; instead of a dead white window,
 * offer a way back. Nothing here touches the map data itself
 */
function watchRendererHealth(window: BrowserWindow): void {
  window.on("unresponsive", () => {
    dialog
      .showMessageBox(window, {
        type: "warning",
        buttons: ["Reload", "Keep Waiting"],
        defaultId: 1,
        cancelId: 1,
        title: "The app stopped responding",
        message: "The map view stopped responding",
        detail: "A huge map or a heavy operation can freeze the view for a while. Reloading loses unsaved changes"
      })
      .then(({ response }) => {
        if (response === 0 && !window.isDestroyed()) window.webContents.reload();
      });
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details.reason, details.exitCode);
    if (window.isDestroyed()) return;
    dialog
      .showMessageBox(window, {
        type: "error",
        buttons: ["Reload", "Close"],
        defaultId: 0,
        cancelId: 1,
        title: "The map view crashed",
        message: "The map view crashed and was stopped",
        detail: `Reason: ${details.reason}. Reloading restores the app, but unsaved changes may be lost`
      })
      .then(({ response }) => {
        if (window.isDestroyed()) return;
        if (response === 0) window.webContents.reload();
        else {
          skipConfirmation = true; // the renderer is dead: there is nothing left to confirm with
          window.close();
        }
      });
  });
}

function createWindow(): void {
  const { maximized, fullscreen, ...bounds } = readState();

  const window = new BrowserWindow({
    ...bounds,
    fullscreen, // set here rather than after: entering fullscreen on a window that is not shown yet is unreliable
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: ICON_PATH, // Windows and Linux take the window icon from here, macOS from the app bundle
    backgroundColor: "#000000",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false // generation and autosave run on timers that must survive losing focus
    }
  });

  if (maximized && !fullscreen) window.maximize();

  window.once("ready-to-show", () => window.show());
  enableDevTools(window);
  routeExternalLinks(window);
  watchRendererHealth(window);
  confirmOnClose(window);
  window.loadURL(DEV_SERVER_URL || APP_URL); // an empty variable is no dev server either
}

// macOS hands an opened document to the running app instead of launching it with argv
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  void intakeMapFile(filePath);
});

app.on("child-process-gone", (_event, details) => {
  console.error(`Child process gone (${details.type}):`, details.reason);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const mapFile = collectMapFileFromArgv(argv);
    if (mapFile) void intakeMapFile(mapFile);

    const [window] = BrowserWindow.getAllWindows();
    if (!window) return createWindow();
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(() => {
    // a dev run borrows the Electron bundle, so its dock icon has to be replaced by hand
    if (!app.isPackaged) app.dock?.setIcon(nativeImage.createFromPath(ICON_PATH));
    serveRenderer();
    buildMenu();
    createWindow();
    initUpdater(allowClose); // app-wide, so re-opening a window on macOS does not start a second updater
    initMobileServerIPC(); // the phone pairing server; the renderer decides when it runs

    // launched by double-clicking a .map file: queue it, the renderer pulls it on boot
    const initialFile = collectMapFileFromArgv(process.argv);
    if (initialFile) void intakeMapFile(initialFile);

    app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });

  app.on("will-quit", () => void stopMobileServer());
  app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
}
