// The connect screen: scan the desktop QR code, paste a pairing code, or type the address.
// Recent connections are remembered locally.
import { decodePairingUri, type PairingPayload } from "@/types/mobile-protocol";
import type { ConnectionTarget } from "../services/pc-client";

const RECENTS_KEY = "fmg-recents";
const LANG = navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";

const t = {
  title: LANG === "ru" ? "FMG Mobile" : "FMG Mobile",
  subtitle:
    LANG === "ru"
      ? "Тонкий клиент для Fantasy Map Generator: карту считает и отрисует ПК, телефон просто показывает её в 60 FPS."
      : "A thin client for Fantasy Map Generator: the PC computes and renders the map, the phone just shows it at 60 FPS.",
  scan: LANG === "ru" ? "Сканировать QR" : "Scan QR",
  manual: LANG === "ru" ? "Или подключитесь вручную" : "Or connect manually",
  address: LANG === "ru" ? "Адрес ПК (пусто = этот сервер, напр. 192.168.1.10:8087)" : "PC address (empty = this server, e.g. 192.168.1.10:8087)",
  token: LANG === "ru" ? "Код подключения" : "Pairing code",
  pasteHint: LANG === "ru" ? "…или вставьте код fmvg:// из QR" : "…or paste an fmvg:// code from the QR",
  connect: LANG === "ru" ? "Подключиться" : "Connect",
  recent: LANG === "ru" ? "Последние подключения" : "Recent connections",
  scanUnavailable: LANG === "ru" ? "Сканер доступен только в приложении на телефоне" : "The scanner is only available in the phone app",
  connectFailed: LANG === "ru" ? "Не удалось подключиться" : "Cannot connect",
  connecting: LANG === "ru" ? "Подключение…" : "Connecting…",
  demoHint:
    LANG === "ru"
      ? "Совет: для быстрой проверки запустите демо-сервер на ПК: npm run mobile:demo"
      : "Tip: for a quick test run the demo server on the PC: npm run mobile:demo"
};

type Recent = ConnectionTarget & { at: number };

export function loadRecents(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}

function saveRecent(target: ConnectionTarget): void {
  const recents = loadRecents().filter(recent => !(recent.host === target.host && recent.port === target.port));
  recents.unshift({ ...target, at: Date.now() });
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, 5)));
}

export class PairingView {
  private container: HTMLElement;
  onConnect: (target: ConnectionTarget) => void;

  constructor(container: HTMLElement, onConnect: (target: ConnectionTarget) => void) {
    this.container = container;
    this.onConnect = onConnect;
    this.render();
  }

  private render(recents: Recent[] = loadRecents()): void {
    this.container.innerHTML = `
      <div class="pairing">
        <div class="hero">
          <div class="heroIcon">🗺️</div>
          <h1>${t.title}</h1>
          <p>${t.subtitle}</p>
        </div>
        <button id="btnScan" class="primary">${t.scan}</button>
        <div class="divider">${t.manual}</div>
        <label class="field">
          <span>${t.address}</span>
          <input id="inputHost" type="text" inputmode="url" placeholder="192.168.1.10:8087" autocomplete="off" />
        </label>
        <label class="field">
          <span>${t.token}</span>
          <input id="inputToken" type="text" autocomplete="off" spellcheck="false" />
        </label>
        <div class="hint">${t.pasteHint}</div>
        <button id="btnConnect" class="primary">${t.connect}</button>
        <div class="error hidden" id="pairingError"></div>
        ${recents.length ? `<div class="divider">${t.recent}</div><ul class="recents">${recents
          .map(
            (recent, index) =>
              `<li><button data-recent="${index}"><b>${recent.name || recent.host}</b><span>${recent.host}:${recent.port}</span></button></li>`
          )
          .join("")}</ul>` : ""}
        <div class="hint foot">${t.demoHint}</div>
      </div>
    `;

    document.getElementById("btnConnect")?.addEventListener("click", () => this.connectFromInputs());
    document.getElementById("btnScan")?.addEventListener("click", () => void this.scan());
    document.getElementById("inputToken")?.addEventListener("paste", event => {
      const text = (event as ClipboardEvent).clipboardData?.getData("text") ?? "";
      if (text.startsWith("fmvg://")) {
        event.preventDefault();
        this.connectFromUri(text);
      }
    });
    this.container.querySelectorAll("[data-recent]").forEach(button =>
      button.addEventListener("click", () => {
        const recent = recents[Number((button as HTMLElement).dataset.recent)];
        if (recent) this.onConnect({ host: recent.host, port: recent.port, token: recent.token, name: recent.name });
      })
    );
  }

  private showError(message: string): void {
    const error = document.getElementById("pairingError");
    error?.classList.remove("hidden");
    if (error) error.textContent = message;
  }

  private connectFromUri(uri: string): void {
    try {
      const payload: PairingPayload = decodePairingUri(uri);
      this.onConnect({ host: payload.ips[0] ?? "", port: payload.port, token: payload.token, name: payload.name });
    } catch {
      this.showError(t.connectFailed);
    }
  }

  private connectFromInputs(): void {
    const hostInput = (document.getElementById("inputHost") as HTMLInputElement | null)?.value ?? "";
    const tokenInput = (document.getElementById("inputToken") as HTMLInputElement | null)?.value.trim() ?? "";

    if (hostInput.includes("fmvg://")) return this.connectFromUri(hostInput);

    const [hostPart, portPart] = hostInput.replace(/^https?:\/\//, "").split(":");
    const host = hostPart?.trim() ?? "";
    const port = Number(portPart) || 8087;
    if (!tokenInput) return this.showError(t.connectFailed);

    // an empty address means "the origin this page is served from" - the dev proxy mode
    this.onConnect({ host, port, token: tokenInput });
  }

  /** The barcode scanner exists only inside the Capacitor app; in a plain browser we say so */
  private async scan(): Promise<void> {
    try {
      const { CapacitorBarcodeScanner } = await import("@capacitor/barcode-scanner");
      const { ScanResult } = await CapacitorBarcodeScanner.scanBarcode({ hint: 1 /* QR_CODE */ });
      if (ScanResult) this.connectFromUri(ScanResult);
    } catch {
      this.showError(t.scanUnavailable);
    }
  }

  remember(target: ConnectionTarget): void {
    saveRecent(target);
  }

  reset(): void {
    this.render();
  }
}
