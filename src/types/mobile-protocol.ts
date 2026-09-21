// The PC ↔ phone protocol for the mobile offload: the desktop app computes and renders the map,
// the phone only shows it. Shared by the Electron server, the Options UI and the mobile client.
// Keep this module pure: zod and standard globals only, so the web bundle and Node can both use it.
import { z } from "zod";

/** Port the desktop server listens on unless the user changes it */
export const MOBILE_DEFAULT_PORT = 8087;

/** QR / clipboard pairing URI scheme, e.g. fmvg://192.168.1.10:8087?token=... */
export const PAIRING_SCHEME = "fmvg";

export const MIN_TOKEN_LENGTH = 32;

// ---------------------------------------------------------------------------
// LightPack: everything a phone needs to draw the map interactively, and
// deliberately nothing else - no grid, no voronoi, no per-cell arrays
// ---------------------------------------------------------------------------

export const pointSchema = z.tuple([z.number(), z.number()]);

export const lightBurgSchema = z.strictObject({
  i: z.number(),
  x: z.number(),
  y: z.number(),
  name: z.string(),
  population: z.number().nonnegative(),
  state: z.number(),
  capital: z.boolean().optional(),
  port: z.boolean().optional(),
  culture: z.number().optional()
});

export const lightStateSchema = z.strictObject({
  i: z.number(),
  name: z.string(),
  fullName: z.string().optional(),
  color: z.string(),
  capital: z.number(),
  area: z.number().nonnegative(),
  population: z.number().nonnegative(),
  burgs: z.number().nonnegative()
});

export const lightRiverSchema = z.strictObject({
  i: z.number(),
  name: z.string(),
  width: z.number().nonnegative(),
  points: z.array(pointSchema),
  simplified: z.boolean()
});

export const lightRouteSchema = z.strictObject({
  i: z.number(),
  group: z.string(),
  points: z.array(pointSchema)
});

export const lightPackSchema = z.strictObject({
  meta: z.strictObject({
    seed: z.string(),
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    version: z.string(),
    created: z.number()
  }),
  burgs: z.array(lightBurgSchema),
  states: z.array(lightStateSchema),
  rivers: z.array(lightRiverSchema),
  routes: z.array(lightRouteSchema),
  coastlines: z.array(z.array(pointSchema))
});

export type LightPoint = [number, number];
export type LightBurg = z.infer<typeof lightBurgSchema>;
export type LightState = z.infer<typeof lightStateSchema>;
export type LightRiver = z.infer<typeof lightRiverSchema>;
export type LightRoute = z.infer<typeof lightRouteSchema>;
export type LightPack = z.infer<typeof lightPackSchema>;

// ---------------------------------------------------------------------------
// REST payloads
// ---------------------------------------------------------------------------

export const apiStatusSchema = z.strictObject({
  app: z.literal("fantasy-map-generator"),
  protocol: z.number(),
  version: z.string(),
  hasMap: z.boolean(),
  mapName: z.string(),
  seed: z.string(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  hostname: z.string(),
  ips: z.array(z.string()),
  port: z.number(),
  tiles: z.strictObject({ template: z.string(), minZoom: z.number(), maxZoom: z.number() }),
  clients: z.number().nonnegative(),
  mapUpdatedAt: z.number().nullable()
});

export type ApiStatus = z.infer<typeof apiStatusSchema>;

export const generateRequestSchema = z.strictObject({
  seed: z.string().min(1).max(64).optional(),
  width: z.number().positive().max(7680).optional(),
  height: z.number().positive().max(7680).optional()
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const burgDetailsSchema = z.strictObject({
  i: z.number(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  population: z.number().nonnegative(),
  state: z.number(),
  stateName: z.string().optional(),
  culture: z.number().optional(),
  cultureName: z.string().optional(),
  capital: z.boolean().optional(),
  port: z.boolean().optional(),
  features: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});
export type BurgDetails = z.infer<typeof burgDetailsSchema>;

export const stateDetailsSchema = z.strictObject({
  i: z.number(),
  name: z.string(),
  fullName: z.string().optional(),
  formName: z.string().optional(),
  color: z.string(),
  capital: z.number(),
  area: z.number().nonnegative(),
  population: z.number().nonnegative(),
  rural: z.number().nonnegative().optional(),
  urban: z.number().nonnegative().optional(),
  burgs: z.number().nonnegative().optional(),
  neighbors: z.array(z.number()).optional()
});
export type StateDetails = z.infer<typeof stateDetailsSchema>;

// ---------------------------------------------------------------------------
// WebSocket messages. Numbers report progress, commands drive the PC
// ---------------------------------------------------------------------------

export const clientCommandSchema = z.enum(["regenerate", "focus", "getBurg", "ping"]);
export type ClientCommand = z.infer<typeof clientCommandSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("hello"), status: apiStatusSchema, tokenValid: z.boolean() }),
  z.strictObject({
    type: z.literal("generate:progress"),
    stepId: z.string(),
    completed: z.number().nonnegative(),
    total: z.number().nonnegative(),
    percent: z.number().min(0).max(100)
  }),
  z.strictObject({ type: z.literal("generate:done"), seed: z.string(), lightPackUrl: z.string() }),
  z.strictObject({ type: z.literal("generate:error"), message: z.string() }),
  z.strictObject({ type: z.literal("map:updated"), seed: z.string(), lightPackUrl: z.string() }),
  z.strictObject({ type: z.literal("clients"), count: z.number().nonnegative() }),
  z.strictObject({ type: z.literal("burg"), burg: burgDetailsSchema }),
  z.strictObject({ type: z.literal("state"), state: stateDetailsSchema }),
  z.strictObject({
    type: z.literal("ack"),
    action: clientCommandSchema,
    ok: z.boolean(),
    message: z.string().optional()
  }),
  z.strictObject({ type: z.literal("error"), message: z.string() }),
  z.strictObject({ type: z.literal("pong") })
]);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("command"),
    action: clientCommandSchema,
    payload: z.unknown().optional()
  })
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Focus a burg on the PC map, so the user sees what the phone is pointing at */
export type FocusPayload = { burgId: number };

// ---------------------------------------------------------------------------
// Pairing: the QR carries this payload, base64 of compact JSON
// ---------------------------------------------------------------------------

export const pairingPayloadSchema = z.strictObject({
  v: z.number(), // protocol version
  ips: z.array(z.string()),
  port: z.number(),
  token: z.string().min(1),
  name: z.string(),
  version: z.string().optional()
});
export type PairingPayload = z.infer<typeof pairingPayloadSchema>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode the pairing payload: compact JSON in base64, wrapped in the pairing URI */
export function encodePairingUri(payload: PairingPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return `${PAIRING_SCHEME}://pair?data=${encodeURIComponent(bytesToBase64(bytes))}`;
}

/** Decode a scanned pairing URI (or bare base64 payload) back into connection data */
export function decodePairingUri(uri: string): PairingPayload {
  const trimmed = uri.trim();
  const match = /^fmvg:\/\/pair\?data=([^&]+)/.exec(trimmed);
  const encoded = match ? decodeURIComponent(match[1]) : trimmed;
  const json = new TextDecoder().decode(base64ToBytes(encoded));
  return pairingPayloadSchema.parse(JSON.parse(json));
}

/** The WebSocket URL a phone connects to */
export function pairingWebSocketUrl(host: string, port: number, token: string): string {
  return `ws://${host}:${port}/ws?token=${token}`;
}

// ---------------------------------------------------------------------------
// Geometry: Douglas-Peucker polyline simplification, used to shrink LightPack
// ---------------------------------------------------------------------------

function perpendicularDistance(point: LightPoint, start: LightPoint, end: LightPoint): number {
  const [px, py] = point;
  const [ax, ay] = start;
  const [bx, by] = end;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  // project the point onto the segment's line, clamp to the segment
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Reduce polyline point count while keeping the shape within `tolerance` map units.
 * A closed polygon passes the first point again at the end; it is kept as the anchor
 */
export function simplifyPolyline(points: LightPoint[], tolerance = 1): LightPoint[] {
  if (points.length <= 2) return points.map(point => [point[0], point[1]] as LightPoint);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDistance = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index > 0 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const result: LightPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push([points[i][0], points[i][1]]);
  }
  return result;
}
