import { describe, it, expect } from "vitest";
import { WorkerPool, parallelMap } from "./worker-pool";

describe("WorkerPool", () => {
  it("creates pool with default workers", () => {
    const pool = new WorkerPool({ maxWorkers: 2, fallbackToMainThread: true });
    expect(pool.getMaxWorkers()).toBe(2);
    pool.terminate();
  });

  it("reports stats", () => {
    const pool = new WorkerPool({ maxWorkers: 2, fallbackToMainThread: true });
    const stats = pool.getStats();
    expect(stats.totalWorkers).toBeGreaterThanOrEqual(0);
    expect(typeof stats.isSupported).toBe("boolean");
    pool.terminate();
  });

  it("falls back to main thread when workers not supported", async () => {
    const pool = new WorkerPool({ maxWorkers: 1, fallbackToMainThread: true });

    // Use a simple task that will fallback
    const result = await pool.execute("math:heavyCompute", {
      data: [1, 2, 3, 4, 5],
      operation: "normalize"
    });

    expect(Array.isArray(result)).toBe(true);
    pool.terminate();
  });

  it("handles parallelMap", async () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = await parallelMap(data, x => x * 2, { concurrency: 2, chunkSize: 3 });
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it("terminates cleanly", () => {
    const pool = new WorkerPool({ maxWorkers: 2 });
    pool.terminate();
    const stats = pool.getStats();
    expect(stats.totalWorkers).toBe(0);
  });
});
