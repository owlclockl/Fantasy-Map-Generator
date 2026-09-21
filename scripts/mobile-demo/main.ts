// Demo PC server for the mobile client: bundles the REAL MobileServer transport and feeds it a
// procedural demo map (SVG tiles + LightPack), so the phone app can be developed and shown off
// without Electron. Build and run from the repo root:
//   npm run mobile:demo
import { MobileServer } from "@/services/mobile-server/server";
import { simplifyPolyline, type ApiStatus, type BurgDetails, type LightPack, type LightPoint, type StateDetails } from "@/types/mobile-protocol";

const PORT = Number(process.env.PORT ?? 8087);
const WIDTH = 1280;
const HEIGHT = 800;
const MAX_ZOOM = 3; // zoom 0 fits the map in one 256px tile; 3 is 8x that, past native sharpness

const VERSION = "demo-1.0.0";
const STEP_IDS = ["grid", "heightmap", "temperatures", "precipitation", "regraph", "rivers", "biomes", "cultures", "burgs", "states", "routes", "military"];

const STATE_NAMES = ["Valloria", "Khemris", "Ostmark", "Suzerainty of Lleir", "Drakemarch", "Thalassia", "Ironhold"];
const STATE_COLORS = ["#c96f4a", "#7a9e6c", "#5b7fae", "#a76a8e", "#b09a4d", "#6c8f9e", "#8e6c5a"];
const CULTURE_NAMES = ["Valloric", "Khemri", "Oster", "Lleiri", "Drakin", "Thalassic"];
const BURG_PREFIX = ["Ash", "Storm", "Raven", "Gold", "Silver", "Wind", "East", "West", "North", "Red", "Grey", "Stone"];
const BURG_SUFFIX = ["ford", "haven", "burg", "mouth", "field", "port", "watch", "hollow", "rest", "gate"];

type DemoMap = {
  seed: string;
  coast: LightPoint[];
  lakes: LightPoint[][];
  rivers: { i: number; name: string; width: number; points: LightPoint[] }[];
  routes: { i: number; group: string; points: LightPoint[] }[];
  burgs: { i: number; x: number; y: number; name: string; population: number; state: number; capital?: boolean; port?: boolean; culture: number }[];
  states: { i: number; name: string; fullName?: string; color: string; capital: number; area: number; population: number; burgs: number; rural: number; urban: number }[];
};

// ---------------------------------------------------------------------------
// tiny seeded RNG so the demo is stable per seed
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedNumber = (seed: string): number => [...seed].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 7);

const pick = <T>(random: () => number, list: T[]): T => list[Math.floor(random() * list.length)];

// ---------------------------------------------------------------------------
// the procedural demo map
// ---------------------------------------------------------------------------

function generateDemoMap(seed: string): DemoMap {
  const random = mulberry32(seedNumber(seed));
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  // a blobby coastline: polar radius with a few harmonics
  const harmonics = Array.from({ length: 5 }, (_, index) => ({
    amplitude: (26 + random() * 60) / (index + 1),
    phase: random() * Math.PI * 2,
    frequency: index + 2
  }));
  const radius = (angle: number): number => {
    const base = Math.min(WIDTH, HEIGHT) * 0.34;
    let value = base;
    for (const harmonic of harmonics) value += harmonic.amplitude * Math.sin(harmonic.frequency * angle + harmonic.phase);
    return value;
  };

  const coast: LightPoint[] = [];
  for (let step = 0; step < 360; step += 2) {
    const angle = (step / 360) * Math.PI * 2;
    const r = radius(angle);
    coast.push([Math.round(cx + Math.cos(angle) * r * 1.35), Math.round(cy + Math.sin(angle) * r * 0.92)]);
  }
  coast.push([...coast[0]] as LightPoint);

  const inside = (x: number, y: number): boolean => {
    // a point is on land when it is inside every coast segment's left side (convex-ish check via ray cast)
    let hit = false;
    for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) {
      const [xi, yi] = coast[i];
      const [xj, yj] = coast[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  const stateCount = 6;
  const stateCenters = Array.from({ length: stateCount }, () => {
    let x = 0;
    let y = 0;
    do {
      x = 80 + random() * (WIDTH - 160);
      y = 60 + random() * (HEIGHT - 120);
    } while (!inside(x, y));
    return { x, y };
  });
  const nearestState = (x: number, y: number): number => {
    let best = 0;
    let bestDistance = Infinity;
    stateCenters.forEach((center, index) => {
      const distance = (center.x - x) ** 2 + (center.y - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  };

  const burgs = [] as DemoMap["burgs"];
  const burgCount = 46;
  for (let index = 0; index < burgCount; index++) {
    let x = 0;
    let y = 0;
    do {
      x = 60 + random() * (WIDTH - 120);
      y = 50 + random() * (HEIGHT - 100);
    } while (!inside(x, y));
    const state = nearestState(x, y);
    const coastal = random() < 0.25;
    burgs.push({
      i: index + 1,
      x: Math.round(x),
      y: Math.round(y),
      name: `${pick(random, BURG_PREFIX)}${pick(random, BURG_SUFFIX)}`,
      population: Math.round(300 + random() ** 3 * 12000),
      state: state + 1,
      capital: [...burgs].filter(burg => burg.state === state + 1).length === 0,
      port: coastal || undefined,
      culture: state % CULTURE_NAMES.length
    });
  }

  const states = stateCenters.map((center, index) => {
    const own = burgs.filter(burg => burg.state === index + 1);
    const rural = Math.round(40000 + random() * 160000);
    return {
      i: index + 1,
      name: STATE_NAMES[index],
      fullName: index % 2 ? `Kingdom of ${STATE_NAMES[index]}` : undefined,
      color: STATE_COLORS[index],
      capital: own[0]?.i ?? 1,
      area: Math.round(3000 + random() * 20000),
      population: rural + own.reduce((sum, burg) => sum + burg.population, 0),
      burgs: own.length,
      rural,
      urban: own.reduce((sum, burg) => sum + burg.population, 0)
    };
  });

  const rivers = Array.from({ length: 6 }, (_, index) => {
    let x = 100 + random() * (WIDTH - 200);
    let y = 100 + random() * (HEIGHT - 200);
    const points: LightPoint[] = [[Math.round(x), Math.round(y)]];
    const target = pick(random, stateCenters);
    for (let step = 0; step < 24; step++) {
      x += (target.x - x) * 0.12 + (random() - 0.5) * 60;
      y += (target.y - y) * 0.12 + (random() - 0.5) * 60;
      points.push([Math.round(x), Math.round(y)]);
    }
    return { i: index + 1, name: `${pick(random, BURG_PREFIX)}flow`, width: Math.round(random() * 4 * 10) / 10, points: simplifyPolyline(points, 2) };
  });

  const routes = Array.from({ length: 9 }, (_, index) => {
    const from = pick(random, burgs);
    const to = pick(random, burgs);
    if (from.i === to.i) return null;
    const points: LightPoint[] = [];
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      points.push([Math.round(from.x + (to.x - from.x) * t + (random() - 0.5) * 24), Math.round(from.y + (to.y - from.y) * t + (random() - 0.5) * 24)]);
    }
    return { i: index + 1, group: pick(random, ["roads", "trails", "searoutes"]), points: simplifyPolyline(points, 2) };
  }).filter(route => route !== null);

  const lakes = Array.from({ length: 2 }, () => {
    let x = 0;
    let y = 0;
    do {
      x = 150 + random() * (WIDTH - 300);
      y = 120 + random() * (HEIGHT - 240);
    } while (!inside(x, y));
    const r = 14 + random() * 26;
    const points: LightPoint[] = [];
    for (let step = 0; step < 18; step++) {
      const angle = (step / 18) * Math.PI * 2;
      points.push([Math.round(x + Math.cos(angle) * r), Math.round(y + Math.sin(angle) * r * 0.8)]);
    }
    points.push([...points[0]] as LightPoint);
    return points;
  });

  return { seed, coast, lakes, rivers, routes, burgs, states };
}

// ---------------------------------------------------------------------------
// SVG tile rendering
// ---------------------------------------------------------------------------

const OCEAN = "#20364d";
const LAND = "#cfc199";
const LAND_EDGE = "#54718c";
const RIVER = "#5b93c6";

function renderTileSvg(map: DemoMap, z: number, x: number, y: number): string {
  const scale = 2 ** z; // tiles across the map width
  const tileWidth = WIDTH / scale;
  const tileHeight = HEIGHT / scale;
  const x0 = x * tileWidth;
  const y0 = y * tileHeight;

  const poly = (points: LightPoint[], close: boolean): string =>
    points.map(([px, py]) => `${px},${py}`).join(" ") + (close ? ` ${points[0][0]},${points[0][1]}` : "");

  const burgRadius = Math.max(0.6 / scale, 2.2 / scale ** 0.35) * 1.6;
  const labelZoom = z >= 2;
  const stateLabel = z <= 2;

  const burgMarkup = map.burgs
    .map(burg => {
      const color = map.states[burg.state - 1]?.color ?? "#999";
      return (
        `<circle cx="${burg.x}" cy="${burg.y}" r="${burgRadius.toFixed(2)}" fill="${color}" stroke="#2b1d16" stroke-width="${(burgRadius / 3).toFixed(2)}"/>` +
        (labelZoom
          ? `<text x="${burg.x + burgRadius * 1.6}" y="${burg.y + burgRadius * 0.8}" font-size="${(3.4 / scale ** 0.72).toFixed(2)}" fill="#2e2620" stroke="#e8e0cf" stroke-width="${(0.8 / scale ** 0.72).toFixed(2)}" paint-order="stroke">${burg.name}</text>`
          : "")
      );
    })
    .join("");

  const stateMarkup = stateLabel
    ? map.states
        .map((state, index) => {
          const center = map.burgs.find(burg => burg.i === state.capital) ?? { x: WIDTH / 2, y: HEIGHT / 2 };
          return `<text x="${center.x}" y="${center.y - 14 / scale}" text-anchor="middle" font-size="${(11 / scale ** 0.72).toFixed(2)}" font-weight="700" fill="${STATE_COLORS[index]}" stroke="#f2ecd9" stroke-width="${(2 / scale ** 0.72).toFixed(2)}" paint-order="stroke" opacity="0.9">${state.name.toUpperCase()}</text>`;
        })
        .join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="${x0} ${y0} ${tileWidth} ${tileHeight}">
  <rect x="${x0}" y="${y0}" width="${tileWidth}" height="${tileHeight}" fill="${OCEAN}"/>
  <polygon points="${poly(map.coast, true)}" fill="${LAND}" stroke="${LAND_EDGE}" stroke-width="${(1.2 / scale).toFixed(3)}"/>
  ${map.lakes.map(lake => `<polygon points="${poly(lake, true)}" fill="${OCEAN}" stroke="${LAND_EDGE}" stroke-width="${(0.8 / scale).toFixed(3)}"/>`).join("")}
  ${map.rivers.map(river => `<polyline points="${poly(river.points, false)}" fill="none" stroke="${RIVER}" stroke-width="${((0.6 + river.width * 0.5) / scale).toFixed(3)}" stroke-linecap="round"/>`).join("")}
  ${map.routes.map(route => `<polyline points="${poly(route.points, false)}" fill="none" stroke="#7a614a" stroke-width="${(1.4 / scale).toFixed(3)}" stroke-dasharray="${6 / scale} ${5 / scale}"/>`).join("")}
  ${burgMarkup}
  ${stateMarkup}
</svg>`;
}

// ---------------------------------------------------------------------------
// server wiring
// ---------------------------------------------------------------------------

const PAIRING_TOKEN = "demo-token-demo-token-demo-token-32";

let map = generateDemoMap("demo-seed-1");
const server = new MobileServer();

const status = (): ApiStatus => ({
  app: "fantasy-map-generator",
  protocol: 1,
  version: VERSION,
  hasMap: true,
  mapName: `Demo World (${map.seed})`,
  seed: map.seed,
  width: WIDTH,
  height: HEIGHT,
  hostname: "demo-pc",
  ips: ["demo.local"],
  port: PORT,
  tiles: { template: "/api/tiles/{z}/{x}/{y}.svg", minZoom: 0, maxZoom: MAX_ZOOM },
  clients: server.clientCount,
  mapUpdatedAt: Date.now()
});

const lightPack = (): LightPack => ({
  meta: { seed: map.seed, name: `Demo World (${map.seed})`, width: WIDTH, height: HEIGHT, version: VERSION, created: Date.now() },
  burgs: map.burgs,
  states: map.states,
  rivers: map.rivers.map(river => ({ ...river, simplified: true })),
  routes: map.routes,
  coastlines: [map.coast, ...map.lakes]
});

let generating = false;

async function simulateGeneration(): Promise<void> {
  if (generating) return;
  generating = true;
  try {
    for (let completed = 1; completed <= STEP_IDS.length; completed++) {
      await new Promise(resolve => setTimeout(resolve, 550));
      const stepId = STEP_IDS[completed - 1];
      server.broadcast({ type: "generate:progress", stepId, completed, total: STEP_IDS.length, percent: Math.round((completed / STEP_IDS.length) * 100) });
    }
    map = generateDemoMap(`demo-seed-${Math.floor(Math.random() * 9999)}`);
    await server.publishLightPack();
    server.broadcast({ type: "generate:done", seed: map.seed, lightPackUrl: "/api/map/light" });
    server.broadcast({ type: "map:updated", seed: map.seed, lightPackUrl: "/api/map/light" });
  } finally {
    generating = false;
  }
}

const burgDetails = (id: number): BurgDetails | null => {
  const burg = map.burgs.find(candidate => candidate.i === id);
  if (!burg) return null;
  return {
    ...burg,
    stateName: map.states[burg.state - 1]?.name,
    cultureName: CULTURE_NAMES[burg.culture % CULTURE_NAMES.length],
    features: { walls: burg.population > 6000, citadel: Boolean(burg.capital), temple: burg.population > 3000 }
  };
};

const stateDetails = (id: number): StateDetails | null => map.states.find(state => state.i === id) ?? null;

await server.start(
  {
    getStatus: status,
    getLightPack: () => JSON.stringify(lightPack()),
    getBurg: burgDetails,
    getState: stateDetails,
    getTile: (z, x, y, ext) => {
      if (ext !== "svg" || z < 0 || z > MAX_ZOOM) return null;
      const tilesX = 2 ** z;
      const tilesY = Math.ceil((tilesX * HEIGHT) / WIDTH);
      if (x >= tilesX || y >= tilesY) return null;
      return { body: new TextEncoder().encode(renderTileSvg(map, z, x, y)), contentType: "image/svg+xml" };
    },
    startGeneration: () => void simulateGeneration(),
    log: message => console.log(`[demo] ${message}`)
  },
  { port: PORT, token: PAIRING_TOKEN }
);

console.log(`Demo PC server (real MobileServer transport) on port ${PORT}`);
console.log(`Pairing URI: fmvg://pair?data=${Buffer.from(JSON.stringify({ v: 1, ips: ["127.0.0.1"], port: PORT, token: PAIRING_TOKEN, name: "Demo PC", version: VERSION })).toString("base64")}`);
console.log(`Pairing token: ${PAIRING_TOKEN}`);
console.log(`Try: curl http://127.0.0.1:${PORT}/api/status`);
