import { describe, expect, it } from "vitest";
import type { PackedGraph } from "@/types/PackedGraph";
import { toLightPack } from "./export-light";

type MutableCells = Partial<PackedGraph["cells"]>;

/** A hand-built graph with just enough shape to exercise the export */
function makePack(): PackedGraph {
  const cells: MutableCells = {
    p: [
      [0, 0],
      [10, 0],
      [20, 0],
      [0, 10],
      [10, 10],
      [20, 10]
    ]
  };
  return {
    cells,
    vertices: {
      p: [
        [0, 0],
        [40, 0],
        [40, 40],
        [0, 40],
        [20, -2]
      ],
      x: [],
      y: [],
      i: [],
      c: [],
      v: []
    },
    features: [
      {
        i: 0,
        type: "ocean",
        land: false,
        cells: 1,
        vertices: [],
        area: 1
      } as unknown as PackedGraph["features"][number],
      {
        i: 1,
        type: "island",
        land: true,
        cells: 12,
        vertices: [0, 1, 2, 3],
        area: 40
      } as unknown as PackedGraph["features"][number],
      { i: 2, type: "lake", land: false, cells: 2, vertices: [4], area: 1 } as PackedGraph["features"][number]
    ],
    burgs: [
      { i: 0, x: 1, y: 1, name: "Placeholder", removed: true } as unknown as PackedGraph["burgs"][number],
      {
        i: 1,
        x: 10.5,
        y: 20.25,
        name: "Capital",
        population: 1234.6,
        state: 1,
        capital: 1,
        port: 1,
        culture: 2
      } as unknown as PackedGraph["burgs"][number],
      { i: 2, x: 30, y: 40, name: "Town", population: 100, state: 1 } as PackedGraph["burgs"][number]
    ],
    states: [
      { i: 0, name: "neutral", removed: false } as unknown as PackedGraph["states"][number],
      {
        i: 1,
        name: "Empire",
        fullName: "The Empire",
        color: "#aa3344",
        capital: 1,
        area: 42,
        rural: 900,
        urban: 100,
        burgs: 2
      } as PackedGraph["states"][number]
    ],
    rivers: [
      {
        i: 1,
        name: "Long",
        cells: Array.from({ length: 12 }, (_, i) => i),
        points: Array.from({ length: 12 }, (_, i) => [i * 10, i % 2 === 0 ? 0 : 0.5] as [number, number]),
        width: 1.234
      } as unknown as PackedGraph["rivers"][number],
      {
        i: 2,
        name: "Creek",
        cells: [1, 2],
        points: [
          [0, 0],
          [1, 1]
        ]
      } as PackedGraph["rivers"][number]
    ],
    routes: [
      {
        i: 1,
        group: "roads",
        points: [
          [0, 0, 1],
          [5, 5, 2],
          [9, 9, 3]
        ],
        merged: false
      } as unknown as PackedGraph["routes"][number],
      { i: 2, group: "roads", points: [[1, 1, 2]], merged: true } as PackedGraph["routes"][number]
    ]
  } as unknown as PackedGraph;
}

describe("toLightPack", () => {
  const meta = { seed: "s1", name: "World", width: 1280, height: 800, version: "1.0.0", created: 7 };

  it("keeps live burgs with rounded coordinates and flags", () => {
    const pack = toLightPack(makePack(), meta);
    expect(pack.burgs).toHaveLength(2);
    const capital = pack.burgs[0];
    expect(capital).toMatchObject({ i: 1, x: 10.5, y: 20.25, name: "Capital", population: 1235, state: 1 });
    expect(capital.capital).toBe(true);
    expect(capital.port).toBe(true);
    expect(pack.burgs.some(burg => burg.name === "Placeholder")).toBe(false);
  });

  it("drops the neutral state and carries the population sums", () => {
    const pack = toLightPack(makePack(), meta);
    expect(pack.states).toEqual([
      {
        i: 1,
        name: "Empire",
        fullName: "The Empire",
        color: "#aa3344",
        capital: 1,
        area: 42,
        population: 1000,
        burgs: 2
      }
    ]);
  });

  it("simplifies rivers and drops tiny ones", () => {
    const pack = toLightPack(makePack(), meta);
    expect(pack.rivers.map(river => river.name)).toEqual(["Long"]);
    expect(pack.rivers[0].points.length).toBeLessThan(12);
    expect(pack.rivers[0].simplified).toBe(true);
    expect(pack.rivers[0].width).toBe(1.23);
  });

  it("keeps only unmerged routes with more than one point", () => {
    const pack = toLightPack(makePack(), meta);
    expect(pack.routes).toEqual([
      {
        i: 1,
        group: "roads",
        points: [
          [0, 0],
          [9, 9]
        ]
      }
    ]);
  });

  it("exports non-ocean features as simplified coastline polylines", () => {
    const pack = toLightPack(makePack(), meta);
    expect(pack.coastlines).toEqual([
      [
        [0, 0],
        [40, 0],
        [40, 40],
        [0, 40]
      ]
    ]);
  });

  it("carries the metadata unchanged", () => {
    const pack = toLightPack(makePack(), meta);
    expect(pack.meta).toEqual(meta);
  });
});
