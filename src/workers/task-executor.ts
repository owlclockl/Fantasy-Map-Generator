// Task executor that can run on both main thread and worker thread
// Contains the actual computation logic for parallel tasks

export type TaskPayload = {
  // Temperature calculation
  temperature?: {
    heights: number[] | Uint8Array;
    width: number;
    height: number;
    cellsX: number;
    points: [number, number][];
    climate: {
      equator: number;
      northPole: number;
      southPole: number;
    };
    coordinates: {
      latN: number;
      latT: number;
    };
    heightExponent: number;
  };

  // Precipitation calculation chunk
  precipitation?: {
    heights: number[] | Uint8Array;
    temps: number[] | Int8Array;
    cellsX: number;
    cellsY: number;
    startRow: number;
    endRow: number;
    seed: string;
  };

  // Biomes calculation
  biomes?: {
    temps: number[] | Int8Array;
    precs: number[] | Uint8Array;
    heights: number[] | Uint8Array;
    start: number;
    end: number;
  };

  // Generic array processing
  arrayProcess?: {
    data: any[];
    operation: string;
    start: number;
    end: number;
    params?: any;
  };

  // Population ranking
  populationRank?: {
    cells: {
      area: number[];
      biome: number[];
      height: number[];
      temp: number[];
      prec: number[];
      river: number[];
      harbor: number[];
    };
    start: number;
    end: number;
  };

  // Culture expansion simulation chunk
  cultureExpansion?: {
    costs: number[];
    frontier: number[];
    cultures: number[];
    start: number;
    end: number;
  };
};

export function executeTask(task: { type: string; payload: any }): any {
  switch (task.type) {
    case "temperature:compute":
      return computeTemperature(task.payload);

    case "precipitation:computeChunk":
      return computePrecipitationChunk(task.payload);

    case "biomes:computeChunk":
      return computeBiomesChunk(task.payload);

    case "array:process":
      return processArrayChunk(task.payload);

    case "population:rankChunk":
      return rankPopulationChunk(task.payload);

    case "culture:expandChunk":
      return expandCultureChunk(task.payload);

    case "math:heavyCompute":
      return heavyMathCompute(task.payload);

    case "grid:findCells":
      return findCellsInRadius(task.payload);

    default:
      throw new Error(`Unknown task type: ${task.type}`);
  }
}

function computeTemperature(payload: NonNullable<TaskPayload["temperature"]>): Int8Array {
  const { heights, height, cellsX, points, climate, coordinates, heightExponent } = payload;
  const temp = new Int8Array(points.length);

  const tropics = [16, -20];
  const tropicalGradient = 0.15;

  const tempNorthTropic = climate.equator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - climate.northPole) / (90 - tropics[0]);

  const tempSouthTropic = climate.equator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - climate.southPole) / (90 + tropics[1]);

  const getSeaLevelTemperature = (latitude: number) => {
    const isTropical = latitude <= 16 && latitude >= -20;
    if (isTropical) return climate.equator - Math.abs(latitude) * tropicalGradient;

    return latitude > 0
      ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
      : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
  };

  const getAltitudeDrop = (h: number) => {
    if (h < 20) return 0;
    return Math.round(((h - 18) ** heightExponent / 1000) * 6.5);
  };

  for (let rowCellId = 0; rowCellId < points.length; rowCellId += cellsX) {
    const y = points[rowCellId]?.[1] || 0;
    const rowLatitude = coordinates.latN - (y / height) * coordinates.latT;
    const seaLevelTemp = getSeaLevelTemperature(rowLatitude);

    for (let cellId = rowCellId; cellId < Math.min(rowCellId + cellsX, points.length); cellId++) {
      const altitudeDrop = getAltitudeDrop(heights[cellId]);
      temp[cellId] = Math.max(-128, Math.min(127, seaLevelTemp - altitudeDrop));
    }
  }

  return temp;
}

function computePrecipitationChunk(payload: any): { prec: Uint8Array; start: number; end: number } {
  // Simplified precipitation chunk calculation
  const { heights, startRow, endRow, cellsX } = payload;
  const prec = new Uint8Array((endRow - startRow) * cellsX);

  for (let i = 0; i < prec.length; i++) {
    const globalIndex = startRow * cellsX + i;
    const h = heights[globalIndex] || 0;
    // Simplified model: higher elevation = less precipitation, but with noise
    prec[i] = h < 20 ? 80 + Math.random() * 40 : Math.max(5, 100 - h * 0.8 + Math.random() * 20);
  }

  return { prec, start: startRow * cellsX, end: endRow * cellsX };
}

function computeBiomesChunk(payload: NonNullable<TaskPayload["biomes"]>): Uint8Array {
  const { temps, precs, heights, start, end } = payload;
  const biomes = new Uint8Array(end - start);

  for (let i = start; i < end; i++) {
    const idx = i - start;
    const temp = temps[i] || 0;
    const prec = precs[i] || 0;
    const h = heights[i] || 0;

    // Simplified biome determination
    if (h < 20) {
      biomes[idx] = 0; // water
    } else if (temp < -5) {
      biomes[idx] = prec < 30 ? 1 : 2; // tundra / boreal
    } else if (temp < 10) {
      biomes[idx] = prec < 50 ? 3 : 4; // temperate dry / wet
    } else if (temp < 20) {
      biomes[idx] = prec < 40 ? 5 : 6; // subtropical dry / wet
    } else {
      biomes[idx] = prec < 50 ? 7 : 8; // tropical dry / wet
    }
  }

  return biomes;
}

function processArrayChunk(payload: NonNullable<TaskPayload["arrayProcess"]>): any[] {
  const { data, operation, start, end, params } = payload;
  const result = [];

  for (let i = start; i < Math.min(end, data.length); i++) {
    switch (operation) {
      case "map":
        result.push(params?.fn ? params.fn(data[i], i) : data[i]);
        break;
      case "filter":
        if (params?.predicate ? params.predicate(data[i], i) : true) {
          result.push(data[i]);
        }
        break;
      case "sum":
        result.push(data[i]);
        break;
      default:
        result.push(data[i]);
    }
  }

  return result;
}

function rankPopulationChunk(payload: NonNullable<TaskPayload["populationRank"]>): Float32Array {
  const { cells, start, end } = payload;
  const scores = new Float32Array(end - start);

  for (let i = start; i < end; i++) {
    const idx = i - start;
    const area = cells.area[i] || 1;
    const biome = cells.biome[i] || 0;
    const height = cells.height[i] || 0;
    const temp = cells.temp[i] || 0;
    const prec = cells.prec[i] || 0;

    // Simplified habitability score
    let score = area * 0.1;

    // Biome modifier
    if (biome === 0)
      score = 0; // water
    else if (biome <= 2)
      score *= 0.3; // cold
    else if (biome <= 4)
      score *= 0.8; // temperate
    else score *= 1.2; // warm

    // Height modifier
    if (height > 80) score *= 0.2;
    else if (height > 60) score *= 0.5;

    // Temperature sweet spot
    if (temp >= 10 && temp <= 25) score *= 1.3;
    else if (temp < 0 || temp > 35) score *= 0.4;

    // Precipitation
    if (prec >= 30 && prec <= 150) score *= 1.2;
    else if (prec < 10 || prec > 200) score *= 0.5;

    scores[idx] = score;
  }

  return scores;
}

function expandCultureChunk(payload: NonNullable<TaskPayload["cultureExpansion"]>): {
  newCosts: number[];
  newFrontier: number[];
} {
  const { costs, frontier, cultures, start, end } = payload;
  const newCosts = [...costs];
  const newFrontier: number[] = [];

  for (let i = start; i < Math.min(end, frontier.length); i++) {
    const cellId = frontier[i];
    if (cellId === undefined) continue;

    const cultureId = cultures[cellId];
    if (!cultureId) continue;

    // Simulate expansion to neighbors (simplified)
    // In real implementation, this would check actual neighbors
    newCosts[cellId] = (costs[cellId] || 0) + 1;
    if (Math.random() > 0.7) {
      newFrontier.push(cellId);
    }
  }

  return { newCosts, newFrontier };
}

function heavyMathCompute(payload: { data: number[]; operation: string }): number[] {
  const { data, operation } = payload;

  switch (operation) {
    case "normalize": {
      const max = Math.max(...data);
      const min = Math.min(...data);
      const range = max - min || 1;
      return data.map(v => (v - min) / range);
    }

    case "smooth":
      return data.map((v, i, arr) => {
        if (i === 0 || i === arr.length - 1) return v;
        return (arr[i - 1] + v + arr[i + 1]) / 3;
      });

    case "gaussianBlur": {
      const result = [...data];
      const kernel = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545];
      for (let i = 2; i < data.length - 2; i++) {
        result[i] =
          data[i - 2] * kernel[0] +
          data[i - 1] * kernel[1] +
          data[i] * kernel[2] +
          data[i + 1] * kernel[3] +
          data[i + 2] * kernel[4];
      }
      return result;
    }

    default:
      return data;
  }
}

function findCellsInRadius(payload: { x: number; y: number; radius: number; points: [number, number][] }): number[] {
  const { x, y, radius, points } = payload;
  const result: number[] = [];
  const radiusSq = radius * radius;

  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy <= radiusSq) {
      result.push(i);
    }
  }

  return result;
}
