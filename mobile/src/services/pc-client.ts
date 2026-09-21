// The only connection a phone has to the PC: REST reads, WebSocket events, commands.
// Everything heavy stays on the desktop - this module just asks for finished tiles and JSON.
import type { ApiStatus, BurgDetails, ClientCommand, GenerateRequest, ServerMessage, StateDetails } from "@/types/mobile-protocol";

export type ConnectionEvents = {
  status: ApiStatus;
  progress: { stepId: string; completed: number; total: number; percent: number };
  "map:updated": { seed: string };
  clients: { count: number };
  "generation:error": { message: string };
  error: { message: string };
  close: { code: number };
};

export type ConnectionTarget = { host: string; port: number; token: string; name?: string };

export type ConnectionState = "disconnected" | "connecting" | "connected" | "offline";

type Handler<T extends keyof ConnectionEvents> = (payload: ConnectionEvents[T]) => void;

const PING_INTERVAL_MS = 10_000;

export class PcClient {
  private target: ConnectionTarget;
  private socket: WebSocket | null = null;
  private pingTimer = 0;
  private handlers = new Map<keyof ConnectionEvents, Set<Handler<never>>>();
  state: ConnectionState = "disconnected";

  constructor(target: ConnectionTarget) {
    this.target = target;
  }

  get token(): string {
    return this.target.token;
  }

  get targetName(): string {
    return this.target.name || `${this.target.host}:${this.target.port}`;
  }

  on<T extends keyof ConnectionEvents>(event: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  private emit<T extends keyof ConnectionEvents>(event: T, payload: ConnectionEvents[T]): void {
    this.handlers.get(event)?.forEach(handler => (handler as Handler<T>)(payload));
  }

  /** Empty when dev-serving through the vite proxy: requests go to the page's own origin */
  private httpBase(): string {
    return this.target.host ? `http://${this.target.host}:${this.target.port}` : "";
  }

  private wsUrl(): string {
    if (this.target.host) return `ws://${this.target.host}:${this.target.port}/ws?token=${this.target.token}`;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${location.host}/ws?token=${this.target.token}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.httpBase()}${path}`, init);
    if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
    return (await response.json()) as T;
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit("status", this.currentStatus ?? ({ app: "fantasy-map-generator" } as ApiStatus));
  }

  private currentStatus: ApiStatus | null = null;

  // ---------------------------------------------------------------------------
  // REST
  // ---------------------------------------------------------------------------

  async fetchStatus(): Promise<ApiStatus> {
    const status = await this.request<ApiStatus>("/api/status");
    this.currentStatus = status;
    return status;
  }

  fetchLightPack(): Promise<import("@/types/mobile-protocol").LightPack> {
    return this.request("/api/map/light");
  }

  fetchBurg(id: number): Promise<BurgDetails> {
    return this.request(`/api/map/burg/${id}`);
  }

  fetchState(id: number): Promise<StateDetails> {
    return this.request(`/api/map/state/${id}`);
  }

  async fetchTile(z: number, x: number, y: number, ext: string): Promise<Blob | null> {
    const response = await fetch(`${this.httpBase()}/api/tiles/${z}/${x}/${y}.${ext}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`tile ${z}/${x}/${y} failed: ${response.status}`);
    return response.blob();
  }

  /** Ask the PC to make a new map; progress arrives over the WebSocket */
  async generate(request: GenerateRequest = {}): Promise<void> {
    await fetch(`${this.httpBase()}/api/generate?token=${this.target.token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  // ---------------------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    this.setState("connecting");
    await this.fetchStatus().catch(() => undefined);
    const socket = new WebSocket(this.wsUrl());
    this.socket = socket;

    const opened = new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("cannot reach the PC"));
    });
    socket.onclose = event => {
      this.stopPing();
      this.socket = null;
      this.setState("offline");
      this.emit("close", { code: event.code });
    };
    socket.onmessage = event => this.onMessage(String(event.data));

    try {
      await opened;
    } catch (error) {
      this.setState("offline");
      throw error;
    }
    this.setState("connected");
    this.startPing();
  }

  private onMessage(text: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case "hello":
        this.currentStatus = message.status;
        this.emitStatus();
        break;
      case "generate:progress":
        this.emit("progress", { stepId: message.stepId, completed: message.completed, total: message.total, percent: message.percent });
        break;
      case "generate:done":
      case "map:updated":
        this.emit("map:updated", { seed: message.seed });
        break;
      case "generate:error":
      case "error":
        this.emit(message.type === "error" ? "error" : "generation:error", { message: message.message });
        break;
      case "clients":
        this.emit("clients", { count: message.count });
        break;
      default:
        break;
    }
  }

  sendCommand(action: ClientCommand, payload?: unknown): void {
    this.socket?.send(JSON.stringify({ type: "command", action, payload }));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.sendCommand("ping");
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = 0;
  }

  disconnect(): void {
    this.stopPing();
    this.handlers.clear();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.setState("disconnected");
  }
}
