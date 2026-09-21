// Canonical generation sequence, as a declared pipeline instead of a hand-written call list. See docs/architecture/generation-pipeline.md.
// Enhanced with multithreading support for performance improvements
import { GraphOverride } from "@/generators/graph-override";
import { Pipeline, type PipelineStep } from "@/generators/pipeline";
import { Population } from "@/generators/population-generator";
import type { GridGraph } from "@/types/GridGraph";
import { Coordinates } from "./coordinates";

const generationPipelineSteps = [
  { id: "grid", run: ({ graph }) => Grid.prepare(graph), useWorker: true, estimatedDuration: 800 },
  { id: "heightmap", run: () => HeightmapGenerator.generate(), useWorker: true, estimatedDuration: 1200 },
  { id: "markupGrid", run: () => Features.markupGrid(), estimatedDuration: 200 },
  { id: "depressionLakes", run: () => Grid.addDeepDepressionLakes(), estimatedDuration: 300 },
  { id: "nearSeaLakes", run: () => Grid.openNearSeaLakes(), estimatedDuration: 200 },
  { id: "mapSize", run: () => Coordinates.generate(), estimatedDuration: 100 },
  {
    id: "temperatures",
    run: () => Temperature.generate(),
    useWorker: true,
    parallelizable: true,
    estimatedDuration: 600
  },
  {
    id: "precipitation",
    run: () => Precipitation.generate(),
    useWorker: true,
    parallelizable: true,
    estimatedDuration: 700
  },
  {
    id: "clearPack",
    run: () => {
      Pack.clear();
      GraphOverride.clear(); // the old graph is gone, do not pin its vertices
    },
    estimatedDuration: 50
  },
  { id: "regraph", run: () => Pack.generate(), useWorker: true, estimatedDuration: 1000 },
  { id: "markupPack", run: () => Features.markupPack(), estimatedDuration: 300 },
  { id: "defaultRuler", run: () => Measurers.createDefaultRuler(), estimatedDuration: 50 },
  { id: "rivers", run: () => Rivers.generate(), useWorker: true, parallelizable: true, estimatedDuration: 900 },
  { id: "biomes", run: () => Biomes.generate(), useWorker: true, parallelizable: true, estimatedDuration: 500 },
  { id: "featureGroups", run: () => Features.defineGroups(), estimatedDuration: 200 },
  { id: "ice", run: () => Ice.generate(), estimatedDuration: 300 },
  { id: "goods", run: () => Goods.generate(), parallelizable: true, estimatedDuration: 400 },
  { id: "rankCells", run: () => Population.rankCells(), useWorker: true, parallelizable: true, estimatedDuration: 600 },
  { id: "cultures", run: () => Cultures.generate(), estimatedDuration: 500 },
  { id: "culturesExpand", run: () => Cultures.expand(), useWorker: true, parallelizable: true, estimatedDuration: 800 },
  { id: "burgs", run: () => Burgs.generate(), useWorker: true, estimatedDuration: 700 },
  { id: "states", run: () => States.generate(), useWorker: true, estimatedDuration: 800 },
  { id: "routes", run: () => Routes.generate(), parallelizable: true, estimatedDuration: 600 },
  { id: "religions", run: () => Religions.generate(), estimatedDuration: 400 },
  { id: "burgsSpecify", run: () => Burgs.specify(), estimatedDuration: 300 },
  { id: "stateStatistics", run: () => States.collectStatistics(), parallelizable: true, estimatedDuration: 200 },
  { id: "stateForms", run: () => States.defineStateForms(), estimatedDuration: 200 },
  { id: "provinces", run: () => Provinces.generate(), parallelizable: true, estimatedDuration: 500 },
  { id: "provincePoles", run: () => Provinces.getPoles(), parallelizable: true, estimatedDuration: 300 },
  { id: "riversSpecify", run: () => Rivers.specify(), estimatedDuration: 200 },
  { id: "featureNames", run: () => Features.defineNames(), parallelizable: true, estimatedDuration: 300 },
  { id: "markets", run: () => Markets.generate(), parallelizable: true, estimatedDuration: 400 },
  { id: "production", run: () => Production.produce(), parallelizable: true, estimatedDuration: 500 },
  { id: "taxes", run: () => States.collectTaxes(), parallelizable: true, estimatedDuration: 200 },
  { id: "military", run: () => Military.generate(), parallelizable: true, estimatedDuration: 400 },
  { id: "markers", run: () => Markers.generate(), parallelizable: true, estimatedDuration: 300 },
  { id: "zones", run: () => Zones.generate(), estimatedDuration: 300 },
  { id: "addedLabels", run: () => AddedLabels.initiate(), estimatedDuration: 200 },
  { id: "journeys", run: () => Journeys.generate(), parallelizable: true, estimatedDuration: 300 }
] as const satisfies PipelineStep<string, GenerationContext>[];

type GenerationPipelineStepId = (typeof generationPipelineSteps)[number]["id"];

type GenerationContext = {
  graph?: GridGraph; // pre-created grid to use instead of generating one
};

export const GenerationPipeline = new Pipeline<GenerationPipelineStepId, GenerationContext>(
  "Generation Pipeline",
  generationPipelineSteps
);

const erasePipelineSteps = [
  { id: "markupGrid", run: () => Features.markupGrid() },
  { id: "depressionLakes", run: ({ erosion }) => erosion && Grid.addDeepDepressionLakes() },
  { id: "nearSeaLakes", run: ({ erosion }) => erosion && Grid.openNearSeaLakes() },
  { id: "temperatures", run: () => Temperature.generate(), useWorker: true, parallelizable: true },
  { id: "precipitation", run: () => Precipitation.generate(), useWorker: true, parallelizable: true },
  { id: "regraph", run: () => Pack.generate(), useWorker: true },
  { id: "markupPack", run: () => Features.markupPack() },
  { id: "rivers", run: ({ erosion }) => Rivers.generate(erosion), useWorker: true, parallelizable: true },
  { id: "biomes", run: () => Biomes.define(), useWorker: true, parallelizable: true },
  { id: "featureGroups", run: () => Features.defineGroups() },
  { id: "ice", run: () => Ice.generate() },
  { id: "goods", run: () => Goods.generate(), parallelizable: true },
  { id: "rankCells", run: () => Population.rankCells(), useWorker: true, parallelizable: true },
  { id: "cultures", run: () => Cultures.generate() },
  { id: "culturesExpand", run: () => Cultures.expand(), useWorker: true, parallelizable: true },
  { id: "burgs", run: () => Burgs.generate(), useWorker: true },
  { id: "states", run: () => States.generate(), useWorker: true },
  { id: "routes", run: () => Routes.generate(), parallelizable: true },
  { id: "religions", run: () => Religions.generate() },
  { id: "burgsSpecify", run: () => Burgs.specify() },
  { id: "stateStatistics", run: () => States.collectStatistics(), parallelizable: true },
  { id: "stateForms", run: () => States.defineStateForms() },
  { id: "provinces", run: () => Provinces.generate(), parallelizable: true },
  { id: "provincePoles", run: () => Provinces.getPoles(), parallelizable: true },
  { id: "riversSpecify", run: () => Rivers.specify() },
  { id: "featureNames", run: () => Features.defineNames(), parallelizable: true },
  { id: "markets", run: () => Markets.generate(), parallelizable: true },
  { id: "production", run: () => Production.produce(), parallelizable: true },
  { id: "taxes", run: () => States.collectTaxes(), parallelizable: true },
  { id: "military", run: () => Military.generate(), parallelizable: true },
  { id: "markers", run: () => Markers.generate(), parallelizable: true },
  { id: "zones", run: () => Zones.generate() }
] as const satisfies PipelineStep<GenerationPipelineStepId, EraseContext>[];

type EraseContext = { erosion: boolean };
export const ErasePipeline = new Pipeline<GenerationPipelineStepId, EraseContext>(
  "Erase Heightmap",
  erasePipelineSteps
);

declare global {
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var GenerationPipeline: import("@/generators/pipeline").Pipeline<GenerationPipelineStepId, GenerationContext>;
}
window.GenerationPipeline = GenerationPipeline;
