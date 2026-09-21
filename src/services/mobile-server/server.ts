// The LAN server a phone connects to. Runs wherever Node runs - in the packaged app that is the
// Electron main process, in tests and in the demo it is plain Node. Transport only: every bit of
// map data comes from the injected providers, so this module knows nothing about FMG itself.

import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { gzipSync } from "node:zlib";
import type {
  ApiStatus,
  BurgDetails,
  ClientCommand,
  GenerateRequest,
  ServerMessage,
  StateDetails
} from "@/types/mobile-protocol";
import { clientMessageSchema, generateRequestSchema } from "@/types/mobile-protocol";
import {
  computeAcceptKey,
  decodeText,
  encodeClose,
  encodeFrame,
  encodeText,
  FrameParser,
  OP_CLOSE,
  OP_PING,
  OP_PONG,
  OP_TEXT,
  type WsFrame
} from "./ws-frames";

export interface TileResponse {
  body: Uint8Array;
  contentType: string;
}

export interface MobileServerProviders {
  /** live server metadata for /api/status and the hello message */
  getStatus(): ApiStatus | Promise<ApiStatus>;
  /** the LightPack JSON text for /api/map/light */
  getLightPack(): string | Promise<string>;
  getBurg?(id: number): BurgDetails | null | Promise<BurgDetails | null>;
  getState?(id: number): StateDetails | null | Promise<StateDetails | null>;
  getTile?(z: number, x: number, y: number, ext: string): TileResponse | null | Promise<TileResponse | null>;
  /** a phone asked the PC to make a new map; resolve once the request was handed over */
  startGeneration?(request: GenerateRequest): void | Promise<void>;
  /** every WS command the transport does not serve itself */
  onCommand?(action: ClientCommand, payload: unknown, clientId: number): void | Promise<void>;
  log?(message: string): void;
}

type WsClient = { id: number; socket: Duplex; parser: FrameParser };

const MAX_CLIENTS = 8;
const GENERATE_RATE_LIMIT = 10;
const GENERATE_WINDOW_MS = 1000;
const PROVIDER_TIMEOUT_MS = 20_000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", ...CORS };

/** Control-flow by exception keeps the route handlers flat: throw, the outer handler writes */
class HttpResponse extends Error {
  constructor(
    readonly body: string,
    readonly status: number,
    readonly headers: Record<string, string> = JSON_HEADERS
  ) {
    super(`HTTP ${status}`);
  }
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}): never => {
  throw new HttpResponse(JSON.stringify(data), status, { ...JSON_HEADERS, ...headers });
};

const withTimeout = async <T>(promise: Promise<T> | T, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), PROVIDER_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export class MobileServer {
  private httpServer: http.Server | null = null;
  private providers: MobileServerProviders | null = null;
  private token = "";
  private clients = new Map<number, WsClient>();
  private nextClientId = 0;
  private generateTimes: number[] = [];
  private lightPackJson: string | null = null;
  private lightPackGz: Buffer | null = null;

  get isRunning(): boolean {
    return this.httpServer !== null;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  async start(
    providers: MobileServerProviders,
    options: { port: number; token: string; host?: string }
  ): Promise<number> {
    if (this.httpServer) return this.port();
    this.providers = providers;
    this.token = options.token;

    const server = http.createServer((request, response) => void this.handleRequest(request, response));
    server.on("upgrade", (request, socket, head) => void this.handleUpgrade(request, socket, head));

    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.host ?? "0.0.0.0", () => {
        this.httpServer = server;
        providers.log?.(`mobile server listening on ${options.host ?? "0.0.0.0"}:${this.port()}`);
        resolve(this.port());
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.httpServer;
    if (!server) return;
    this.httpServer = null;

    for (const client of this.clients.values()) {
      this.sendRaw(client, encodeClose(1001, "server stopping"));
      client.socket.destroy();
    }
    this.clients.clear();

    await new Promise<void>(resolve => server.close(() => resolve()));
    this.providers?.log?.("mobile server stopped");
  }

  port(): number {
    const address = this.httpServer?.address() as AddressInfo | string | null;
    return typeof address === "object" && address ? address.port : 0;
  }

  /** Fresh map data arrived: refresh the cache so the next /api/map/light serves it */
  async publishLightPack(): Promise<void> {
    if (!this.providers) return;
    this.lightPackJson = await this.providers.getLightPack();
    this.lightPackGz = null;
  }

  broadcast(message: ServerMessage): void {
    const frame = encodeText(JSON.stringify(message));
    for (const client of this.clients.values()) this.sendRaw(client, frame);
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, CORS);
        response.end();
        return;
      }
      await this.route(request, response, url);
    } catch (error) {
      if (error instanceof HttpResponse) {
        response.writeHead(error.status, error.headers);
        response.end(error.body);
      } else {
        this.providers?.log?.(`${request.method} ${url.pathname} failed: ${(error as Error).message}`);
        if (!response.headersSent) response.writeHead(500, JSON_HEADERS);
        response.end(JSON.stringify({ error: "internal error" }));
      }
    }
  }

  private async route(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const providers = this.providers;
    if (!providers) return json({ error: "server is starting" }, 503);
    const { pathname } = url;

    if (request.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      return json({
        app: "fantasy-map-generator",
        endpoints: ["/api/status", "/api/map/light", "/api/tiles/{z}/{x}/{y}.png", "/ws?token="]
      });
    }

    if (request.method === "GET" && pathname === "/api/status") {
      return json(await withTimeout(providers.getStatus(), "status"));
    }

    if (request.method === "GET" && pathname === "/api/map/light") {
      const pack = this.lightPackJson ?? (await withTimeout(providers.getLightPack(), "light pack"));
      this.lightPackJson ??= pack;
      if ((request.headers["accept-encoding"] ?? "").includes("gzip")) {
        this.lightPackGz ??= gzipSync(Buffer.from(pack));
        response.writeHead(200, {
          ...JSON_HEADERS,
          "Content-Encoding": "gzip",
          "Cache-Control": "no-cache",
          Vary: "Accept-Encoding"
        });
        response.end(this.lightPackGz);
        return;
      }
      response.writeHead(200, { ...JSON_HEADERS, "Cache-Control": "no-cache" });
      response.end(pack);
      return;
    }

    const burg = /^\/api\/map\/burg\/(\d+)$/.exec(pathname);
    if (request.method === "GET" && burg) {
      const details = providers.getBurg ? await withTimeout(providers.getBurg(Number(burg[1])), "burg") : null;
      return details ? json(details) : json({ error: "burg not found" }, 404);
    }

    const state = /^\/api\/map\/state\/(\d+)$/.exec(pathname);
    if (request.method === "GET" && state) {
      const details = providers.getState ? await withTimeout(providers.getState(Number(state[1])), "state") : null;
      return details ? json(details) : json({ error: "state not found" }, 404);
    }

    const tile = /^\/api\/tiles\/(\d+)\/(\d+)\/(\d+)\.(\w+)$/.exec(pathname);
    if (request.method === "GET" && tile) {
      const rendered = providers.getTile
        ? await withTimeout(providers.getTile(Number(tile[1]), Number(tile[2]), Number(tile[3]), tile[4]), "tile")
        : null;
      if (!rendered) return json({ error: "tile not found" }, 404);
      response.writeHead(200, {
        "Content-Type": rendered.contentType,
        "Content-Length": rendered.body.byteLength,
        ...CORS,
        "Cache-Control": "public, max-age=86400"
      });
      response.end(rendered.body);
      return;
    }

    if (request.method === "POST" && pathname === "/api/generate") {
      if (!this.isAuthorized(request, url)) return json({ error: "unauthorized: a valid token is required" }, 401);
      if (!this.allowGenerate()) return json({ error: "rate limit exceeded" }, 429);
      let payload: GenerateRequest = {};
      try {
        const body = await this.readBody(request);
        payload = generateRequestSchema.parse(body ? JSON.parse(body) : {});
      } catch (error) {
        if ((error as Error).message === "body too large") return json({ error: "body too large" }, 413);
        return json({ error: "invalid generate request" }, 400);
      }
      await withTimeout(providers.startGeneration?.(payload), "generate");
      return json({ jobId: crypto.randomUUID() }, 202);
    }

    json({ error: "not found" }, 404);
  }

  private readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on("data", chunk => {
        size += chunk.length;
        if (size > 1 << 20) {
          reject(new Error("body too large"));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      request.on("error", reject);
    });
  }

  /** Reads are open on the LAN; anything that drives the PC needs the pairing token */
  private isAuthorized(request: IncomingMessage, url: URL): boolean {
    const header = request.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    const token = url.searchParams.get("token") ?? bearer;
    return Boolean(token) && token === this.token;
  }

  private allowGenerate(): boolean {
    const now = Date.now();
    this.generateTimes = this.generateTimes.filter(time => now - time < GENERATE_WINDOW_MS);
    if (this.generateTimes.length >= GENERATE_RATE_LIMIT) return false;
    this.generateTimes.push(now);
    return true;
  }

  // ---------------------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------------------

  private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const rejectSocket = (status: number, message: string): void => {
      socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };

    if (url.pathname !== "/ws") return rejectSocket(404, "Not Found");
    if (this.clients.size >= MAX_CLIENTS) return rejectSocket(503, "Too Many Clients");
    if (!this.isAuthorized(request, url)) return rejectSocket(401, "Unauthorized");
    const key = request.headers["sec-websocket-key"];
    if (request.headers.upgrade?.toLowerCase() !== "websocket" || !key) return rejectSocket(400, "Bad Request");

    const accept = await computeAcceptKey(key);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        "\r\n"
    );

    const client: WsClient = { id: ++this.nextClientId, socket, parser: new FrameParser() };
    this.clients.set(client.id, client);
    (socket as unknown as { setNoDelay?: (value: boolean) => void }).setNoDelay?.(true);
    socket.on("data", (chunk: Buffer) => this.onSocketData(client, chunk));
    socket.on("close", () => this.onSocketClose(client));
    socket.on("error", () => this.onSocketClose(client));
    this.providers?.log?.(`client #${client.id} connected (${this.clients.size} online)`);

    if (head.length) this.onSocketData(client, head);
    this.send(client, {
      type: "hello",
      status: await withTimeout(this.providers!.getStatus(), "status"),
      tokenValid: true
    });
    this.broadcast({ type: "clients", count: this.clients.size });
  }

  private onSocketData(client: WsClient, chunk: Buffer): void {
    let frames: WsFrame[];
    try {
      frames = client.parser.push(new Uint8Array(chunk));
    } catch (error) {
      this.providers?.log?.(`client #${client.id} protocol error: ${(error as Error).message}`);
      this.sendRaw(client, encodeClose(1002, "protocol error"));
      client.socket.destroy();
      return;
    }

    for (const frame of frames) {
      if (frame.opcode === OP_CLOSE) {
        this.sendRaw(client, frame.payload.length >= 2 ? encodeFrame(OP_CLOSE, frame.payload) : encodeClose(1000));
        this.onSocketClose(client);
        client.socket.destroy();
        return;
      }
      if (frame.opcode === OP_PING) {
        this.sendRaw(client, encodeFrame(OP_PONG, frame.payload));
        continue;
      }
      if (frame.opcode === OP_TEXT) void this.onClientText(client, decodeText(frame.payload));
    }
  }

  private async onClientText(client: WsClient, text: string): Promise<void> {
    let message: ReturnType<typeof clientMessageSchema.parse>;
    try {
      message = clientMessageSchema.parse(JSON.parse(text));
    } catch {
      return this.send(client, { type: "error", message: "unrecognized message" });
    }
    if (message.type !== "command") return;
    const providers = this.providers;
    if (!providers) return;

    const { action, payload } = message;
    providers.log?.(`client #${client.id} command: ${action}`);

    if (action === "ping") return this.send(client, { type: "pong" });
    if (action === "getBurg") {
      const id = Number((payload as { burgId?: number } | null)?.burgId);
      const details = Number.isFinite(id) && providers.getBurg ? await providers.getBurg(id) : null;
      return details
        ? this.send(client, { type: "burg", burg: details })
        : this.send(client, { type: "error", message: `burg ${id} not found` });
    }

    try {
      await providers.onCommand?.(action, payload, client.id);
      this.send(client, { type: "ack", action, ok: true });
    } catch (error) {
      this.send(client, { type: "ack", action, ok: false, message: (error as Error).message });
    }
  }

  private onSocketClose(client: WsClient): void {
    if (!this.clients.has(client.id)) return;
    this.clients.delete(client.id);
    this.providers?.log?.(`client #${client.id} disconnected (${this.clients.size} online)`);
    this.broadcast({ type: "clients", count: this.clients.size });
  }

  private send(client: WsClient, message: ServerMessage): void {
    this.sendRaw(client, encodeText(JSON.stringify(message)));
  }

  private sendRaw(client: WsClient, frame: Uint8Array): void {
    if (client.socket.destroyed) return;
    client.socket.write(Buffer.from(frame));
  }
}
