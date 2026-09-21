import { describe, expect, it } from "vitest";
import {
  apiStatusSchema,
  clientMessageSchema,
  decodePairingUri,
  encodePairingUri,
  type LightPack,
  lightPackSchema,
  serverMessageSchema,
  simplifyPolyline
} from "./mobile-protocol";

const line = (count: number, step = 1): [number, number][] =>
  Array.from({ length: count }, (_, i) => [i * step, i * i] as [number, number]); // a parabola

describe("simplifyPolyline", () => {
  it("keeps short polylines as they are", () => {
    const points: [number, number][] = [
      [0, 0],
      [5, 5]
    ];
    expect(simplifyPolyline(points, 1)).toEqual(points);
  });

  it("drops points that stay within tolerance of the chord", () => {
    const straight: [number, number][] = [
      [0, 0],
      [1, 0.1],
      [2, -0.1],
      [3, 0.2],
      [10, 0]
    ];
    expect(simplifyPolyline(straight, 1)).toEqual([
      [0, 0],
      [10, 0]
    ]);
  });

  it("keeps the bend of a sharp corner", () => {
    const corner: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10]
    ];
    expect(simplifyPolyline(corner, 1)).toEqual(corner);
  });

  it("never returns fewer than two points", () => {
    expect(simplifyPolyline(line(10), 1000).length).toBe(2);
  });

  it("reduces a detailed coastline but keeps every point within tolerance of the result", () => {
    const detailed = line(500);
    const simplified = simplifyPolyline(detailed, 2);
    expect(simplified.length).toBeLessThan(100);

    const distanceToSegment = (point: [number, number], start: [number, number], end: [number, number]): number => {
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq
        ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSq))
        : 0;
      return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
    };

    for (const point of detailed) {
      let nearest = Infinity;
      for (let i = 0; i < simplified.length - 1; i++) {
        nearest = Math.min(nearest, distanceToSegment(point, simplified[i], simplified[i + 1]));
      }
      expect(nearest).toBeLessThanOrEqual(2.0001);
    }
  });
});

describe("pairing payload codec", () => {
  const payload = { v: 1, ips: ["192.168.1.10", "10.0.0.5"], port: 8087, token: "abc123", name: "MyPC" };

  it("round-trips through the pairing URI", () => {
    const uri = encodePairingUri(payload);
    expect(uri.startsWith("fmvg://pair?data=")).toBe(true);
    expect(decodePairingUri(uri)).toEqual(payload);
  });

  it("accepts a bare base64 payload", () => {
    const uri = encodePairingUri(payload);
    expect(decodePairingUri(uri.replace("fmvg://pair?data=", ""))).toEqual(payload);
  });

  it("rejects garbage", () => {
    expect(() => decodePairingUri("not-base64!!!")).toThrow();
    expect(() => decodePairingUri("fmvg://pair?data=e30=")).toThrow(); // "{}"
  });
});

describe("message schemas", () => {
  const lightPack: LightPack = {
    meta: { seed: "test", name: "Test", width: 1280, height: 800, version: "1.0.0", created: 1 },
    burgs: [{ i: 1, x: 10, y: 20, name: "Town", population: 5000, state: 1, capital: true }],
    states: [{ i: 1, name: "Empire", color: "#ff0000", capital: 1, area: 100, population: 10000, burgs: 1 }],
    rivers: [
      {
        i: 1,
        name: "Long",
        width: 2,
        points: [
          [0, 0],
          [1, 1]
        ],
        simplified: true
      }
    ],
    routes: [
      {
        i: 1,
        group: "roads",
        points: [
          [0, 0],
          [5, 5]
        ]
      }
    ],
    coastlines: [
      [
        [0, 0],
        [10, 0],
        [10, 10]
      ]
    ]
  };

  it("validates a light pack", () => {
    expect(lightPackSchema.parse(lightPack)).toBeDefined();
  });

  it("rejects a light pack with unknown fields", () => {
    expect(() => lightPackSchema.parse({ ...lightPack, grid: "nope" })).toThrow();
  });

  it("validates status", () => {
    expect(
      apiStatusSchema.parse({
        app: "fantasy-map-generator",
        protocol: 1,
        version: "1.0.0",
        hasMap: true,
        mapName: "Test",
        seed: "s",
        width: 100,
        height: 100,
        hostname: "pc",
        ips: ["127.0.0.1"],
        port: 8087,
        tiles: { template: "/api/tiles/{z}/{x}/{y}.png", minZoom: 0, maxZoom: 3 },
        clients: 1,
        mapUpdatedAt: null
      })
    ).toBeDefined();
  });

  it("validates every server message type", () => {
    const status = apiStatusSchema.parse({
      app: "fantasy-map-generator",
      protocol: 1,
      version: "1",
      hasMap: false,
      mapName: "",
      seed: "",
      width: 0,
      height: 0,
      hostname: "h",
      ips: [],
      port: 1,
      tiles: { template: "t", minZoom: 0, maxZoom: 1 },
      clients: 0,
      mapUpdatedAt: null
    });
    const messages = [
      { type: "hello", status, tokenValid: true },
      { type: "generate:progress", stepId: "grid", completed: 1, total: 10, percent: 10 },
      { type: "generate:done", seed: "s", lightPackUrl: "/api/map/light" },
      { type: "generate:error", message: "boom" },
      { type: "map:updated", seed: "s", lightPackUrl: "/api/map/light" },
      { type: "clients", count: 2 },
      { type: "burg", burg: { i: 1, name: "A", x: 0, y: 0, population: 1, state: 1 } },
      { type: "state", state: { i: 1, name: "S", color: "#000000", capital: 1, area: 1, population: 1 } },
      { type: "ack", action: "regenerate", ok: true },
      { type: "error", message: "nope" },
      { type: "pong" }
    ];
    for (const message of messages) expect(serverMessageSchema.parse(message)).toBeDefined();
    expect(() => serverMessageSchema.parse({ type: "nope" })).toThrow();
  });

  it("validates client commands", () => {
    expect(clientMessageSchema.parse({ type: "command", action: "ping" })).toBeDefined();
    expect(clientMessageSchema.parse({ type: "command", action: "focus", payload: { burgId: 3 } })).toBeDefined();
    expect(() => clientMessageSchema.parse({ type: "command", action: "nuke" })).toThrow();
  });
});
