// Modern Worker Pool with fallback for environments without Worker support
// Provides multithreading for heavy computations

export type WorkerTask<TInput = any> = {
  id: string;
  type: string;
  payload: TInput;
  transfer?: Transferable[];
};

export type WorkerResult<TOutput = any> = {
  id: string;
  success: boolean;
  result?: TOutput;
  error?: string;
};

type TaskResolver = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  task: WorkerTask;
};

type WorkerWrapper = {
  worker: Worker;
  busy: boolean;
  currentTaskId?: string;
};

export interface WorkerPoolOptions {
  maxWorkers?: number;
  workerUrl?: URL | string;
  name?: string;
  fallbackToMainThread?: boolean;
}

export class WorkerPool {
  private workers: WorkerWrapper[] = [];
  private taskQueue: WorkerTask[] = [];
  private resolvers = new Map<string, TaskResolver>();
  private options: Required<WorkerPoolOptions>;
  private taskIdCounter = 0;
  private completedTasks = 0;
  private failedTasks = 0;
  private isTerminated = false;

  constructor(options: WorkerPoolOptions = {}) {
    const hardwareConcurrency = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    this.options = {
      maxWorkers: options.maxWorkers ?? Math.min(Math.max(hardwareConcurrency - 1, 2), 8),
      workerUrl: options.workerUrl ?? new URL("@/workers/compute.worker.ts", import.meta.url),
      name: options.name ?? "FMG-WorkerPool",
      fallbackToMainThread: options.fallbackToMainThread ?? true
    };

    if (this.isWorkerSupported()) {
      this.initializeWorkers();
    }
  }

  private isWorkerSupported(): boolean {
    return typeof Worker !== "undefined";
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.options.maxWorkers; i++) {
      try {
        const worker = new Worker(this.options.workerUrl, { type: "module", name: `${this.options.name}-${i}` });
        worker.onmessage = (e: MessageEvent<WorkerResult>) => this.handleWorkerMessage(worker, e.data);
        worker.onerror = (e: ErrorEvent) => this.handleWorkerError(worker, e);

        this.workers.push({ worker, busy: false });
      } catch (error) {
        console.warn(`Failed to create worker ${i}:`, error);
        break;
      }
    }

    if (this.workers.length === 0) {
      console.warn("No workers created, will fallback to main thread");
    }
  }

  private handleWorkerMessage(worker: Worker, result: WorkerResult): void {
    const wrapper = this.workers.find(w => w.worker === worker);
    if (wrapper) {
      wrapper.busy = false;
      wrapper.currentTaskId = undefined;
    }

    const resolver = this.resolvers.get(result.id);
    if (!resolver) {
      console.warn(`No resolver for task ${result.id}`);
      this.processQueue();
      return;
    }

    this.resolvers.delete(result.id);

    if (result.success) {
      this.completedTasks++;
      resolver.resolve(result.result);
    } else {
      this.failedTasks++;
      // Fallback to main thread execution if enabled
      if (this.options.fallbackToMainThread) {
        this.executeOnMainThread(resolver.task).then(resolver.resolve).catch(resolver.reject);
      } else {
        resolver.reject(new Error(result.error || "Worker task failed"));
      }
    }

    this.processQueue();
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent): void {
    const wrapper = this.workers.find(w => w.worker === worker);
    if (!wrapper) return;

    const taskId = wrapper.currentTaskId;
    wrapper.busy = false;
    wrapper.currentTaskId = undefined;

    if (taskId) {
      const resolver = this.resolvers.get(taskId);
      if (resolver) {
        this.resolvers.delete(taskId);
        this.failedTasks++;

        if (this.options.fallbackToMainThread) {
          this.executeOnMainThread(resolver.task).then(resolver.resolve).catch(resolver.reject);
        } else {
          resolver.reject(error);
        }
      }
    }

    this.processQueue();
  }

  private async executeOnMainThread(task: WorkerTask): Promise<any> {
    // Fallback execution on main thread
    // Import the compute functions dynamically
    const { executeTask } = await import("@/workers/task-executor");
    return executeTask(task);
  }

  private processQueue(): void {
    if (this.isTerminated) return;

    while (this.taskQueue.length > 0) {
      const availableWorker = this.workers.find(w => !w.busy);
      if (!availableWorker) break;

      const task = this.taskQueue.shift()!;
      availableWorker.busy = true;
      availableWorker.currentTaskId = task.id;

      try {
        if (task.transfer && task.transfer.length > 0) {
          availableWorker.worker.postMessage(task, task.transfer);
        } else {
          availableWorker.worker.postMessage(task);
        }
      } catch (error) {
        availableWorker.busy = false;
        availableWorker.currentTaskId = undefined;

        const resolver = this.resolvers.get(task.id);
        if (resolver) {
          this.resolvers.delete(task.id);
          if (this.options.fallbackToMainThread) {
            this.executeOnMainThread(task).then(resolver.resolve).catch(resolver.reject);
          } else {
            resolver.reject(error);
          }
        }
      }
    }
  }

  async execute<TInput = any, TOutput = any>(
    type: string,
    payload: TInput,
    transfer?: Transferable[]
  ): Promise<TOutput> {
    if (this.isTerminated) {
      throw new Error("WorkerPool is terminated");
    }

    const taskId = `task-${++this.taskIdCounter}-${Date.now()}`;
    const task: WorkerTask<TInput> = {
      id: taskId,
      type,
      payload,
      transfer
    };

    return new Promise<TOutput>((resolve, reject) => {
      this.resolvers.set(taskId, { resolve, reject, task });

      // If no workers available or not supported, execute on main thread
      if (!this.isWorkerSupported() || this.workers.length === 0) {
        if (this.options.fallbackToMainThread) {
          this.executeOnMainThread(task)
            .then(result => {
              this.resolvers.delete(taskId);
              this.completedTasks++;
              resolve(result);
            })
            .catch(err => {
              this.resolvers.delete(taskId);
              this.failedTasks++;
              reject(err);
            });
        } else {
          this.resolvers.delete(taskId);
          reject(new Error("Workers not supported and fallback disabled"));
        }
        return;
      }

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  async executeParallel<TInput, TOutput>(
    type: string,
    payloads: TInput[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<TOutput[]> {
    const total = payloads.length;
    let completed = 0;

    const promises = payloads.map(payload =>
      this.execute<TInput, TOutput>(type, payload).then(result => {
        completed++;
        onProgress?.(completed, total);
        return result;
      })
    );

    return Promise.all(promises);
  }

  getStats() {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      isSupported: this.isWorkerSupported()
    };
  }

  getMaxWorkers(): number {
    return this.options.maxWorkers;
  }

  setMaxWorkers(count: number): void {
    const newCount = Math.min(Math.max(count, 1), 16);
    this.options.maxWorkers = newCount;

    if (!this.isWorkerSupported()) {
      // No workers in this environment, just update count
      return;
    }

    if (newCount === this.workers.length) return;

    if (newCount > this.workers.length) {
      // Add workers
      for (let i = this.workers.length; i < newCount; i++) {
        try {
          const worker = new Worker(this.options.workerUrl, { type: "module", name: `${this.options.name}-${i}` });
          worker.onmessage = (e: MessageEvent<WorkerResult>) => this.handleWorkerMessage(worker, e.data);
          worker.onerror = (e: ErrorEvent) => this.handleWorkerError(worker, e);
          this.workers.push({ worker, busy: false });
        } catch (error) {
          console.warn(`Failed to create worker ${i}:`, error);
          break;
        }
      }
    } else {
      // Remove idle workers
      const toRemove = this.workers.length - newCount;
      let removed = 0;
      for (let i = this.workers.length - 1; i >= 0 && removed < toRemove; i--) {
        if (!this.workers[i].busy) {
          try {
            this.workers[i].worker.terminate();
          } catch {}
          this.workers.splice(i, 1);
          removed++;
        }
      }
    }
  }

  terminate(): void {
    this.isTerminated = true;
    for (const wrapper of this.workers) {
      wrapper.worker.terminate();
    }
    this.workers = [];
    this.taskQueue = [];

    // Reject all pending tasks
    for (const [id, resolver] of this.resolvers) {
      resolver.reject(new Error("WorkerPool terminated"));
      this.resolvers.delete(id);
    }
  }
}

// Singleton pools for different purposes
let globalPool: WorkerPool | null = null;
let generationPool: WorkerPool | null = null;

export function getGlobalWorkerPool(): WorkerPool {
  if (!globalPool) {
    globalPool = new WorkerPool({
      maxWorkers:
        typeof navigator !== "undefined" ? Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 2), 6) : 4,
      name: "FMG-Global"
    });
  }
  return globalPool;
}

export function getGenerationWorkerPool(): WorkerPool {
  if (!generationPool) {
    const workerCount =
      typeof window !== "undefined" && (window as any).options?.app?.ui?.threading?.workers
        ? (window as any).options.app.ui.threading.workers
        : undefined;

    generationPool = new WorkerPool({
      maxWorkers:
        workerCount ||
        (typeof navigator !== "undefined" ? Math.min(Math.max(navigator.hardwareConcurrency || 4, 2), 8) : 4),
      workerUrl: new URL("@/workers/generation.worker.ts", import.meta.url),
      name: "FMG-Generation"
    });
  }
  return generationPool;
}

export function terminateAllPools(): void {
  globalPool?.terminate();
  generationPool?.terminate();
  globalPool = null;
  generationPool = null;
}

// Utility for chunked parallel processing on main thread as fallback
export async function parallelMap<T, R>(
  array: T[],
  mapper: (item: T, index: number) => R | Promise<R>,
  options: { concurrency?: number; chunkSize?: number } = {}
): Promise<R[]> {
  const { concurrency = 4, chunkSize = 100 } = options;

  // For small arrays, just use Promise.all
  if (array.length <= chunkSize) {
    return Promise.all(array.map(mapper));
  }

  const results: R[] = new Array(array.length);
  const chunks: { start: number; end: number }[] = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push({ start: i, end: Math.min(i + chunkSize, array.length) });
  }

  // Process chunks with limited concurrency
  let chunkIndex = 0;

  async function processNextChunk(): Promise<void> {
    while (chunkIndex < chunks.length) {
      const currentChunkIndex = chunkIndex++;
      const { start, end } = chunks[currentChunkIndex];

      for (let i = start; i < end; i++) {
        results[i] = await mapper(array[i], i);
      }

      // Yield to event loop to keep UI responsive
      if (currentChunkIndex % concurrency === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }

  const workers = Array(Math.min(concurrency, chunks.length))
    .fill(null)
    .map(() => processNextChunk());

  await Promise.all(workers);

  return results;
}
