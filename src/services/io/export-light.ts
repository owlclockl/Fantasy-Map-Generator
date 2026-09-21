// LightPack export: shrinks the world the phone is shown into the tiles' companion JSON.
// Runs on the PC only - the mobile client never imports this module's graph inputs.

import {
  type LightPack,
  type LightPoint,
  type LightRiver,
  type LightRoute,
  type LightState,
  simplifyPolyline
} from "@/types/mobile-protocol";
import type { PackedGraph } from "@/types/PackedGraph";

export type LightPackMeta = {
  seed: string;
  name: string;
  width: number;
  height: number;
  version: string;
  created: number;
};

/** Map units a coastline, river or route may deviate by while being simplified */
const SIMPLIFY_TOLERANCE = 1.5;
/** features smaller than this many cells are not worth shipping to a phone */
const MIN_COASTLINE_CELLS = 4;
/** rivers shorter than this many cells are dropped from the phone view */
const MIN_RIVER_CELLS = 8;

type LightGraph = Pick<PackedGraph, "burgs" | "states" | "rivers" | "routes" | "features" | "cells" | "vertices">;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const pointsOf = (vertices: number[], pack: LightGraph): LightPoint[] =>
  vertices.map(vertex => pack.vertices.p[vertex]).filter(point => Array.isArray(point));

const cellPoints = (cells: number[], pack: LightGraph): LightPoint[] =>
  cells.map(cell => pack.cells.p[cell]).filter(point => Array.isArray(point));

export function toLightPack(pack: LightGraph, meta: LightPackMeta): LightPack {
  const burgs = pack.burgs
    .filter(burg => burg && !burg.removed && typeof burg.name === "string")
    .map(burg => ({
      i: burg.i,
      x: round2(burg.x),
      y: round2(burg.y),
      name: burg.name ?? "",
      population: Math.round(burg.population ?? 0),
      state: burg.state ?? 0,
      capital: Boolean(burg.capital) || undefined,
      port: Boolean(burg.port) || undefined,
      culture: burg.culture
    }));

  const states: LightState[] = pack.states
    .filter(state => state && state.i > 0 && !state.removed)
    .map(state => ({
      i: state.i,
      name: state.name,
      fullName: state.fullName,
      color: state.color ?? "#969696",
      capital: state.capital,
      area: Math.round(state.area ?? 0),
      population: Math.round((state.rural ?? 0) + (state.urban ?? 0)),
      burgs: state.burgs ?? 0
    }));

  const rivers: LightRiver[] = pack.rivers
    .filter(river => river && river.cells.length >= MIN_RIVER_CELLS)
    .map(river => {
      const raw = river.points?.length ? river.points : cellPoints(river.cells, pack);
      const points = simplifyPolyline(raw, SIMPLIFY_TOLERANCE);
      return { i: river.i, name: river.name, width: round2(river.width ?? 0), points, simplified: true };
    })
    .filter(river => river.points.length > 1);

  const routes: LightRoute[] = pack.routes
    .filter(route => route && !route.merged && Array.isArray(route.points) && route.points.length > 1)
    .map(route => ({
      i: route.i,
      group: route.group,
      points: simplifyPolyline(
        route.points.map(point => [point[0], point[1]] as LightPoint),
        SIMPLIFY_TOLERANCE
      )
    }))
    .filter(route => route.points.length > 1);

  const coastlines = pack.features
    .filter(feature => feature && feature.type !== "ocean" && feature.cells >= MIN_COASTLINE_CELLS)
    .map(feature => simplifyPolyline(pointsOf(feature.vertices, pack), SIMPLIFY_TOLERANCE))
    .filter(points => points.length > 2);

  return { meta, burgs, states, rivers, routes, coastlines };
}
