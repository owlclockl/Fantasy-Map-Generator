// Integration tests: real HTTP + WebSocket sockets against the MobileServer core in this process
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiStatus, ServerMessage } from "@/types/mobile-protocol";
import { serverMessageSchema } from "@/types/mobile-protocol";
import { MobileServer } from "./server";

const TOKEN = "unit-test-token-unit-test-token-1234";

const status = (): ApiStatus => ({
  app: "fantasy-map-generator",
  protocol: 1,
  version: "test",
  hasMap: true,
  mapName: "Testworld",
  seed: "seed-1",
  width: 1280,
  height: 800,
  hostname: "test-host",
  ips: ["127.0.0.1"],
  port: 1,
  tiles: { template: "/api/tiles/{z}/{x}/{y}.png", minZoom: 0, maxZoom: 3 },
  clients: 0,
  mapUpdatedAt: 42
});

type Providers = ReturnType<typeof makeProviders>;
const makeProviders = () => ({
  getStatus: vi.fn(status),
  getLightPack: vi.fn(() => JSON.stringify({ meta: { seed: "seed-1" }, burgs: [] })),
  getBurg: vi.fn((id: number) => ({ i: id, name: "Capital", x: 1, y: 2, population: 10, state: 1 })),
  getState: vi.fn(() => null),
  getTile: vi.fn((z: number, x: number, y: number) =>
    z === 1 && x === 0 && y === 0 ? { body: new TextEncoder().encode("PNGDATA"), contentType: "image/png" } : null
  ),
  startGeneration: vi.fn(),
  onCommand: vi.fn(),
  log: vi.fn()
});

let server: MobileServer;
let providers: Providers;
let baseUrl: string;

beforeEach(async () => {
  server = new MobileServer();
  providers = makeProviders();
  const port = await server.start(providers, { port: 0, token: TOKEN, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await server.stop();
});

describe("HTTP endpoints", () => {
  it("serves the live status with CORS headers", async () => {
    const response = await fetch(`${baseUrl}/api/status`);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(serverMessageSchema.parse({ type: "hello", status: body, tokenValid: true })).toBeDefined();
    expect(body.seed).toBe("seed-1");
  });

  it("answers OPTIONS preflights", async () => {
    const response = await fetch(`${baseUrl}/api/status`, { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
  });

  it("404s unknown paths", async () => {
    expect((await fetch(`${baseUrl}/nope`)).status).toBe(404);
  });

  it("serves the light pack gzipped when asked, plain otherwise", async () => {
    const plain = await fetch(`${baseUrl}/api/map/light`, { headers: { "accept-encoding": "identity" } });
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(await plain.json()).toEqual({ meta: { seed: "seed-1" }, burgs: [] });

    const gzipped = await fetch(`${baseUrl}/api/map/light`, { headers: { "accept-encoding": "gzip" } });
    expect(gzipped.headers.get("content-encoding")).toBe("gzip");
    expect(await gzipped.json()).toEqual({ meta: { seed: "seed-1" }, burgs: [] });
    expect(providers.getLightPack).toHaveBeenCalledTimes(1); // served from the cache the second time
  });

  it("serves burg details and 404s missing ones", async () => {
    const burg = await fetch(`${baseUrl}/api/map/burg/5`);
    expect(burg.status).toBe(200);
    expect((await burg.json()).name).toBe("Capital");
    expect(providers.getBurg).toHaveBeenCalledWith(5);
    expect((await fetch(`${baseUrl}/api/map/state/1`)).status).toBe(404);
  });

  it("serves tiles from the provider and 404s empty ones", async () => {
    const tile = await fetch(`${baseUrl}/api/tiles/1/0/0.png`);
    expect(tile.status).toBe(200);
    expect(tile.headers.get("content-type")).toBe("image/png");
    expect(await tile.text()).toBe("PNGDATA");
    expect((await fetch(`${baseUrl}/api/tiles/9/9/9.png`)).status).toBe(404);
  });

  it("requires the token to trigger generation", async () => {
    const rejected = await fetch(`${baseUrl}/api/generate`, { method: "POST", body: "{}" });
    expect(rejected.status).toBe(401);
    expect(providers.startGeneration).not.toHaveBeenCalled();

    const ok = await fetch(`${baseUrl}/api/generate?token=${TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed: "abc", width: 2000, height: 1200 })
    });
    expect(ok.status).toBe(202);
    expect(((await ok.json()) as { jobId: string }).jobId).toMatch(/[0-9a-f-]{36}/);
    expect(providers.startGeneration).toHaveBeenCalledWith({ seed: "abc", width: 2000, height: 1200 });
  });

  it("rejects malformed generate bodies", async () => {
    const response = await fetch(`${baseUrl}/api/generate?token=${TOKEN}`, {
      method: "POST",
      body: JSON.stringify({ width: -5 })
    });
    expect(response.status).toBe(400);
  });

  it("rate limits generate requests", async () => {
    const responses = await Promise.all(
      Array.from({ length: 15 }, () => fetch(`${baseUrl}/api/generate?token=${TOKEN}`, { method: "POST", body: "{}" }))
    );
    const statuses = responses.map(response => response.status);
    expect(statuses.filter(code => code === 202).length).toBe(10);
    expect(statuses.filter(code => code === 429).length).toBe(5);
  });
});

describe("WebSocket", () => {
  type Queued = { queue: ServerMessage[]; waiters: ((message: ServerMessage) => void)[]; socket: WebSocket };

  const connect = async (url: string): Promise<Queued> => {
    const socket = new WebSocket(url);
    const state: Queued = { queue: [], waiters: [], socket };
    socket.onmessage = event => {
      const message = serverMessageSchema.parse(JSON.parse(String(event.data)));
      const waiter = state.waiters.shift();
      if (waiter) waiter(message);
      else state.queue.push(message);
    };
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("handshake failed"));
    });
    // the server greets and immediately announces the new client count
    const hello = await nextMessage(state);
    expect(hello.type).toBe("hello");
    const clients = await nextMessage(state);
    expect(clients.type).toBe("clients");
    return state;
  };

  const nextMessage = (state: Queued, timeoutMs = 3000): Promise<ServerMessage> =>
    state.queue.length
      ? Promise.resolve(state.queue.shift()!)
      : new Promise((resolve, reject) => {
          state.waiters.push(resolve);
          setTimeout(() => reject(new Error("no message arrived")), timeoutMs);
        });

  const send = (state: Queued, message: unknown): void => state.socket.send(JSON.stringify(message));

  it("rejects a wrong token at the handshake", async () => {
    await expect(connect(`ws://127.0.0.1:${server.port()}/ws?token=WRONG`)).rejects.toThrow("handshake failed");
    expect(server.clientCount).toBe(0);
  });

  it("greets a valid client and answers pings", async () => {
    const state = await connect(`ws://127.0.0.1:${server.port()}/ws?token=${TOKEN}`);
    expect(server.clientCount).toBe(1);

    send(state, { type: "command", action: "ping" });
    await expect(nextMessage(state)).resolves.toMatchObject({ type: "pong" });
    state.socket.close();
  });

  it("forwards commands to the provider and acknowledges", async () => {
    const state = await connect(`ws://127.0.0.1:${server.port()}/ws?token=${TOKEN}`);

    send(state, { type: "command", action: "regenerate", payload: { seed: "s2" } });
    await expect(nextMessage(state)).resolves.toMatchObject({ type: "ack", action: "regenerate", ok: true });
    expect(providers.onCommand).toHaveBeenCalledWith("regenerate", { seed: "s2" }, expect.any(Number));

    send(state, { type: "command", action: "getBurg", payload: { burgId: 7 } });
    await expect(nextMessage(state)).resolves.toMatchObject({ type: "burg", burg: { i: 7, name: "Capital" } });
    state.socket.close();
  });

  it("answers garbage with an error message, not a crash", async () => {
    const state = await connect(`ws://127.0.0.1:${server.port()}/ws?token=${TOKEN}`);
    state.socket.send("this is not json");
    await expect(nextMessage(state)).resolves.toMatchObject({ type: "error" });
    state.socket.close();
  });

  it("broadcasts to every connected client", async () => {
    const a = await connect(`ws://127.0.0.1:${server.port()}/ws?token=${TOKEN}`);
    const b = await connect(`ws://127.0.0.1:${server.port()}/ws?token=${TOKEN}`);
    // b's arrival announced itself on the older socket; b already consumed its own announcement
    await expect(nextMessage(a)).resolves.toMatchObject({ type: "clients", count: 2 });

    server.broadcast({ type: "map:updated", seed: "seed-9", lightPackUrl: "/api/map/light" });
    await expect(nextMessage(a)).resolves.toMatchObject({ type: "map:updated", seed: "seed-9" });
    await expect(nextMessage(b)).resolves.toMatchObject({ type: "map:updated", seed: "seed-9" });

    a.socket.close();
    b.socket.close();
    await vi.waitFor(() => expect(server.clientCount).toBe(0));
  });
});
