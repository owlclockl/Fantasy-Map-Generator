// Generation worker - specialized for map generation tasks
// Handles more complex generation pipeline steps

export type GenerationTask = {
  id: string;
  type: string;
  payload: any;
  options?: {
    seed?: string;
    width?: number;
    height?: number;
    config?: any;
  };
};

export type GenerationResult = {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  metrics?: {
    duration: number;
    memoryUsed?: number;
  };
};

// Extended task execution for generation pipeline
async function executeGenerationTask(task: GenerationTask): Promise<any> {
  const startTime = performance.now();
  let result: any;

  switch (task.type) {
    case "grid:generate": {
      result = await generateGridChunk(task.payload);
      break;
    }

    case "heightmap:generate": {
      result = await generateHeightmapChunk(task.payload);
      break;
    }

    case "temperature:compute": {
      const { executeTask: exec } = await import("./task-executor");
      result = exec({ type: "temperature:compute", payload: task.payload });
      break;
    }

    case "precipitation:compute": {
      result = await computePrecipitationParallel(task.payload);
      break;
    }

    case "biomes:generate": {
      result = await generateBiomesParallel(task.payload);
      break;
    }

    case "cultures:expand": {
      result = await expandCulturesParallel(task.payload);
      break;
    }

    case "population:rank": {
      result = await rankPopulationParallel(task.payload);
      break;
    }

    case "rivers:generate": {
      result = await generateRiversChunk(task.payload);
      break;
    }

    case "burgs:generate": {
      result = await generateBurgsChunk(task.payload);
      break;
    }

    case "states:generate": {
      result = await generateStatesChunk(task.payload);
      break;
    }

    case "pipeline:step": {
      // Generic pipeline step execution
      const { stepId, context } = task.payload;
      result = await executePipelineStep(stepId, context);
      break;
    }

    default: {
      // Fallback to generic task executor
      const { executeTask: exec } = await import("./task-executor");
      result = exec(task);
    }
  }

  const duration = performance.now() - startTime;

  return {
    result,
    metrics: { duration }
  };
}

async function generateGridChunk(payload: any) {
  const { seed, width, height, cellsDesired, chunkIndex, totalChunks } = payload;

  // Simulate grid generation chunk
  // In real implementation, this would generate actual Voronoi points
  const pointsPerChunk = Math.ceil(cellsDesired / totalChunks);
  const start = chunkIndex * pointsPerChunk;
  const end = Math.min(start + pointsPerChunk, cellsDesired);

  const points: [number, number][] = [];
  const spacing = Math.sqrt((width * height) / cellsDesired);

  // Simple seeded random
  const random = seededRandom(seed + chunkIndex);

  for (let i = start; i < end; i++) {
    const row = Math.floor(i / Math.ceil(width / spacing));
    const col = i % Math.ceil(width / spacing);
    const x = col * spacing + (random() - 0.5) * spacing * 0.9;
    const y = row * spacing + (random() - 0.5) * spacing * 0.9;
    points.push([Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y))]);
  }

  return { points, start, end, spacing };
}

async function generateHeightmapChunk(payload: any) {
  const { start, end, template, seed } = payload;

  // Simplified heightmap generation
  const chunkHeights = new Uint8Array(end - start);
  const random = seededRandom(seed);

  for (let i = 0; i < chunkHeights.length; i++) {
    const globalIndex = start + i;
    // Use template or random noise
    if (template?.data) {
      chunkHeights[i] = template.data[globalIndex % template.data.length] || 0;
    } else {
      // Perlin-like noise approximation
      const noise = Math.sin(globalIndex * 0.01) * Math.cos(globalIndex * 0.013) + random() * 0.3;
      chunkHeights[i] = Math.max(0, Math.min(100, Math.floor((noise + 1) * 50)));
    }
  }

  return { heights: chunkHeights, start, end };
}

async function computePrecipitationParallel(payload: any) {
  const { heights, temps, seed } = payload;
  const prec = new Uint8Array(heights.length);

  const random = seededRandom(seed);

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    const temp = temps[i] || 0;

    if (h < 20) {
      prec[i] = 60 + Math.floor(random() * 40);
    } else {
      const tempFactor = temp < -5 ? 0.3 : temp < 10 ? 0.7 : 1.0;
      const heightFactor = Math.max(0.2, 1 - h / 100);
      prec[i] = Math.floor((50 + random() * 100) * tempFactor * heightFactor);
    }
  }

  return prec;
}

async function generateBiomesParallel(payload: any) {
  const { temps, precs, heights } = payload;
  const biomes = new Uint8Array(heights.length);

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    const temp = temps[i] || 0;
    const prec = precs[i] || 0;

    if (h < 20) {
      biomes[i] = 0;
    } else if (temp < -10) {
      biomes[i] = prec < 20 ? 1 : 2;
    } else if (temp < 0) {
      biomes[i] = prec < 30 ? 3 : 4;
    } else if (temp < 10) {
      biomes[i] = prec < 40 ? 5 : 6;
    } else if (temp < 20) {
      biomes[i] = prec < 50 ? 7 : 8;
    } else {
      biomes[i] = prec < 60 ? 9 : 10;
    }
  }

  return biomes;
}

async function expandCulturesParallel(payload: any) {
  const { cells, cultures, frontier } = payload;
  const newCultures = new Uint16Array(cells.length);
  newCultures.set(cultures);

  // Simplified expansion
  for (const cellId of frontier) {
    const cultureId = cultures[cellId];
    if (!cultureId) continue;

    // Expand to random neighbors (simplified)
    const neighbors = cells[cellId]?.c || [];
    for (const neighbor of neighbors.slice(0, 2)) {
      if (!newCultures[neighbor] && Math.random() > 0.5) {
        newCultures[neighbor] = cultureId;
      }
    }
  }

  return newCultures;
}

async function rankPopulationParallel(payload: any) {
  const { cells } = payload;
  const scores = new Float32Array(cells.length);

  for (let i = 0; i < cells.length; i++) {
    const area = cells.area?.[i] || 1;
    const biome = cells.biome?.[i] || 0;
    const height = cells.height?.[i] || 0;

    let score = area;
    if (biome === 0) score = 0;
    else if (biome <= 2) score *= 0.3;
    else if (biome <= 4) score *= 0.8;
    else score *= 1.2;

    if (height > 80) score *= 0.2;

    scores[i] = score;
  }

  return scores;
}

async function generateRiversChunk(payload: any) {
  const { heights, start, end } = payload;
  const rivers: any[] = [];

  for (let i = start; i < end; i++) {
    const h = heights[i];
    if (h > 20 && h < 70 && Math.random() > 0.95) {
      rivers.push({
        source: i,
        cells: [i],
        length: 1
      });
    }
  }

  return rivers;
}

async function generateBurgsChunk(payload: any) {
  const { scores, start, end, limit } = payload;
  const burgs: any[] = [];

  const sortedIndices = Array.from({ length: end - start }, (_, i) => start + i).sort(
    (a, b) => (scores[b] || 0) - (scores[a] || 0)
  );

  for (let i = 0; i < Math.min(limit, sortedIndices.length); i++) {
    const cellId = sortedIndices[i];
    if ((scores[cellId] || 0) > 10) {
      burgs.push({
        cell: cellId,
        score: scores[cellId],
        i: burgs.length + 1
      });
    }
  }

  return burgs;
}

async function generateStatesChunk(payload: any) {
  const { burgs } = payload;
  const states: any[] = [];

  // Simplified state generation
  for (let i = 0; i < Math.min(burgs.length, 20); i++) {
    states.push({
      i: i + 1,
      center: burgs[i]?.cell || 0,
      burgs: [burgs[i]?.cell || 0],
      color: `hsl(${Math.random() * 360}, 70%, 50%)`
    });
  }

  return states;
}

async function executePipelineStep(stepId: string, context: any) {
  // This would execute actual pipeline steps in worker
  // For now, return a placeholder
  return {
    stepId,
    completed: true,
    context,
    timestamp: Date.now()
  };
}

function seededRandom(seed: string | number): () => number {
  let s = typeof seed === "string" ? hashString(seed) : seed;

  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return (s & 0xfffffff) / 0xfffffff;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

self.onmessage = async (e: MessageEvent<GenerationTask>) => {
  const task = e.data;

  if (!task?.id || !task.type) {
    const result: GenerationResult = {
      id: task?.id || "unknown",
      success: false,
      error: "Invalid task format"
    };
    (self as any).postMessage(result);
    return;
  }

  try {
    const { result, metrics } = await executeGenerationTask(task);

    const response: GenerationResult = {
      id: task.id,
      success: true,
      result,
      metrics
    };

    // Handle transferable objects
    let transfer: Transferable[] = [];
    if (result instanceof ArrayBuffer) {
      transfer = [result];
    } else if (ArrayBuffer.isView(result)) {
      transfer = [result.buffer as ArrayBuffer];
    } else if (result && typeof result === "object") {
      for (const key in result) {
        const value = result[key];
        if (value instanceof ArrayBuffer) {
          transfer.push(value);
        } else if (ArrayBuffer.isView(value)) {
          transfer.push((value as any).buffer as ArrayBuffer);
        }
      }
    }

    if (transfer.length > 0) {
      (self as any).postMessage(response, transfer);
    } else {
      (self as any).postMessage(response);
    }
  } catch (error) {
    const response: GenerationResult = {
      id: task.id,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    (self as any).postMessage(response);
  }
};

// Signal ready
(self as any).postMessage({ type: "worker:ready", id: "init" });
