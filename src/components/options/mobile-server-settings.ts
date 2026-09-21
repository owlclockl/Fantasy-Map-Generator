// The "Mobile Server" section of the Options tab: start/stop the phone pairing server, show the
// QR code and the addresses a phone connects to. The heavy lifting lives in services/mobile-server.
import { tip } from "@/components/tooltips";
import { i18n } from "@/services/i18n";
import { MobileServer } from "@/services/mobile-server/app";
import { findEl } from "@/utils/nodeUtils";

const dict = () => i18n.getDictionary().mobile;

function render(): string {
  const t = dict();
  if (!MobileServer.isAvailable()) {
    return `<div class="mobileServerNoMap" data-i18n="mobile.webOnly">${t.webOnly}</div>`;
  }

  const running = MobileServer.isRunning();
  const status = running
    ? `<span class="mobileServerDot on"></span><span>${t.running}${running ? ` · ${t.port ?? ""}` : ""}</span>`
    : `<span class="mobileServerDot"></span><span>${t.stopped}</span>`;

  return `
    <div class="mobileServerTitle">${t.title}</div>
    <div class="mobileServerStatus" id="mobileServerStatus">${status}</div>
    <div class="mobileServerRow mobileServerControls">
      <button id="mobileServerToggle" class="mobileServerButton ${running ? "on" : ""}">${running ? t.stop : t.start}</button>
      <label>${t.port} <input id="mobileServerPort" type="number" min="1024" max="65535" value="${options.app.mobileServer.port}" ${running ? "disabled" : ""} /></label>
      <label class="mobileServerCheckbox" data-tip="${t.autoStart}">
        <input id="mobileServerAutoStart" type="checkbox" ${options.app.mobileServer.autoStart ? "checked" : ""} /> ${t.autoStart}
      </label>
    </div>
    <div class="mobileServerRow">
      <span id="mobileServerClients">${t.clients}: ${MobileServer.getInfo().clients}</span>
      <button id="mobileServerNewToken" data-tip="${t.newTokenTip}">${t.newToken}</button>
    </div>
    <div id="mobileServerPairing"></div>
  `;
}

async function renderPairing(container: HTMLElement): Promise<void> {
  const t = dict();
  const pairing = await MobileServer.getPairingInfo();
  if (!pairing) return;

  const urls = pairing.urls.map(url => `<div class="mobileServerUrl">${url}</div>`).join("");
  container.innerHTML = `
    <div class="mobileServerHint">${MobileServer.isRunning() ? t.pairing : t.description}</div>
    <canvas id="mobileServerQR" class="mobileServerQR"></canvas>
    <div class="mobileServerUrls">${urls}</div>
    <button id="mobileServerCopy" class="mobileServerButton small">${t.copy}</button>
  `;

  try {
    const { default: QRCode } = await import("qrcode");
    const canvas = findEl<HTMLCanvasElement>("mobileServerQR");
    if (canvas) await QRCode.toCanvas(canvas, pairing.uri, { width: 148, margin: 1 });
  } catch (error) {
    console.warn("QR rendering failed, showing the code as text", error);
    const canvas = findEl("mobileServerQR");
    if (canvas)
      canvas.replaceWith(
        Object.assign(document.createElement("div"), { textContent: pairing.uri, className: "mobileServerUrl" })
      );
  }

  findEl("mobileServerCopy")?.addEventListener("click", () => {
    void navigator.clipboard?.writeText(pairing.uri);
    tip(dict().copied, true, "success", 2000);
  });
}

async function refresh(): Promise<void> {
  const container = findEl("mobileServerSection");
  if (!container) return;
  container.innerHTML = render();
  await MobileServer.refreshInfo().catch(() => undefined);
  container.innerHTML = render(); // re-render with fresh ip/client info
  const pairing = findEl("mobileServerPairing");
  if (pairing) await renderPairing(pairing);
}

function bind(container: HTMLElement): void {
  container.addEventListener("click", event => {
    const target = event.target as HTMLElement;
    if (target.id === "mobileServerToggle") {
      const start = !MobileServer.isRunning();
      (start ? MobileServer.start() : MobileServer.stop())
        .then(() => void refresh())
        .catch(error => tip(`Mobile server: ${(error as Error).message}`, true, "error", 4000));
    } else if (target.id === "mobileServerNewToken") {
      MobileServer.regenerateToken();
      if (MobileServer.isRunning()) {
        // the token is checked on every new connection; a restart re-arms it
        MobileServer.stop()
          .then(() => MobileServer.start())
          .then(() => void refresh());
      } else {
        void refresh();
      }
    }
  });

  container.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.id === "mobileServerPort") {
      const port = Number(target.value);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) return;
      Options.set(config => {
        config.app.mobileServer.port = port;
      });
    } else if (target.id === "mobileServerAutoStart") {
      Options.set(config => {
        config.app.mobileServer.autoStart = target.checked;
      });
    }
  });
}

/** Fills the section the Options template leaves empty; re-runs on rebuilds and language changes */
export function mountMobileServerSection(): void {
  const container = findEl("mobileServerSection");
  if (!container) return;
  if (!container.dataset.bound) {
    container.dataset.bound = "true";
    bind(container);
  }
  void refresh();
}

MobileServer.onChange(() => void refresh());
window.addEventListener("options:rebuilt", () => mountMobileServerSection());
