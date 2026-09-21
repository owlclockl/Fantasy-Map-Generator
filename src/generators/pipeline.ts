// Generic ordered-steps runner with multithreading support
import { getGenerationWorkerPool } from "@/utils/worker-pool";

export interface PipelineStep<Id extends string = string, TContext = void> {
  id: Id;
  run: (context: TContext) => unknown;
  parallelizable?: boolean;
  useWorker?: boolean;
  estimatedDuration?: number;
}

export interface PipelineOptions {
  useWorkers?: boolean;
  maxConcurrency?: number;
  onProgress?: (stepId: string, completed: number, total: number) => void;
  onStepStart?: (stepId: string) => void;
  onStepComplete?: (stepId: string, duration: number) => void;
}

export class Pipeline<Id extends string = string, TContext = void> {
  private readonly name: string;
  private readonly steps: readonly PipelineStep<Id, TContext>[];
  private completedSteps = 0;
  private totalDuration = 0;

  constructor(name: string, steps: readonly PipelineStep<Id, TContext>[]) {
    this.name = name;
    this.steps = steps;
  }

  async run(context: TContext, options: PipelineOptions = {}): Promise<void> {
    const { useWorkers = this.shouldUseWorkers(), onProgress, onStepStart, onStepComplete } = options;

    INFO && console.group(this.name);
    TIME && console.time(this.name);

    this.completedSteps = 0;
    this.totalDuration = 0;

    try {
      for (const step of this.steps) {
        const stepStart = performance.now();
        TIME && console.time(step.id);
        onStepStart?.(step.id);
        INFO &&
          console.log(`[${this.name}] Starting step: ${step.id} ${useWorkers && step.useWorker ? "(worker)" : ""}`);

        try {
          if (useWorkers && step.useWorker) {
            await this.runStepWithWorker(step, context);
          } else if (step.parallelizable && useWorkers) {
            await this.runStepParallel(step, context);
          } else {
            await step.run(context);
          }

          const duration = performance.now() - stepStart;
          this.totalDuration += duration;
          this.completedSteps++;

          onProgress?.(step.id, this.completedSteps, this.steps.length);
          onStepComplete?.(step.id, duration);

          INFO && console.log(`[${this.name}] Completed step: ${step.id} in ${duration.toFixed(2)}ms`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[${this.name}] Failed at step "${step.id}":`, error);
          throw new Error(`${this.name} failed at step "${step.id}": ${reason}`, { cause: error });
        } finally {
          TIME && console.timeEnd(step.id);
        }

        // Yield to event loop to keep UI responsive
        await this.yieldToEventLoop();
      }

      INFO && console.log(`[${this.name}] All steps completed in ${this.totalDuration.toFixed(2)}ms`);
    } finally {
      TIME && console.timeEnd(this.name);
      INFO && console.groupEnd();
    }
  }

  private async runStepWithWorker<TContext>(step: PipelineStep<Id, TContext>, context: TContext): Promise<void> {
    try {
      const pool = getGenerationWorkerPool();

      // Try to offload to worker if the step supports it
      if (this.isWorkerCapableStep(step.id)) {
        await pool.execute("pipeline:step", {
          stepId: step.id,
          context: this.serializeContext(context)
        });
        // Still run on main thread for now as fallback - workers handle heavy subtasks
        await step.run(context);
      } else {
        await step.run(context);
      }
    } catch (error) {
      console.warn(`Worker execution failed for step ${step.id}, falling back to main thread:`, error);
      await step.run(context);
    }
  }

  private async runStepParallel<TContext>(step: PipelineStep<Id, TContext>, context: TContext): Promise<void> {
    // For steps that can be internally parallelized, we let them handle it
    // This is a placeholder for future parallel step implementations
    await step.run(context);
  }

  private isWorkerCapableStep(stepId: string): boolean {
    // Steps that benefit from worker offloading
    const workerCapableSteps = [
      "grid",
      "heightmap",
      "temperatures",
      "precipitation",
      "biomes",
      "rankCells",
      "culturesExpand",
      "rivers",
      "burgs",
      "states"
    ];
    return workerCapableSteps.includes(stepId);
  }

  private serializeContext(context: any): any {
    // Serialize context for worker transfer
    // Avoid circular references and large objects
    if (!context) return {};

    try {
      return {
        seed: context.seed || options?.map?.seed,
        hasGraph: !!context.graph,
        timestamp: Date.now()
      };
    } catch {
      return {};
    }
  }

  private async yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => resolve(), { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  private shouldUseWorkers(): boolean {
    try {
      // Check if threading is enabled in options
      const threadingEnabled = (globalThis as any).options?.app?.ui?.threading?.enabled;
      if (threadingEnabled === false) return false;

      // Check if Workers are supported
      if (typeof Worker === "undefined") return false;

      // Check hardware concurrency
      const concurrency = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 1 : 1;
      return concurrency > 1;
    } catch {
      return false;
    }
  }

  // Run steps in parallel where possible (for independent steps)
  async runParallel(context: TContext, options: PipelineOptions = {}): Promise<void> {
    INFO && console.group(`${this.name} (parallel)`);
    TIME && console.time(`${this.name} (parallel)`);

    try {
      // Group steps by dependencies
      // For now, we still run sequentially but with worker support
      // Future: analyze dependencies and run independent steps in parallel
      await this.run(context, options);
    } finally {
      TIME && console.timeEnd(`${this.name} (parallel)`);
      INFO && console.groupEnd();
    }
  }

  getSteps(): readonly PipelineStep<Id, TContext>[] {
    return this.steps;
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    return {
      completed: this.completedSteps,
      total: this.steps.length,
      percentage: this.steps.length > 0 ? (this.completedSteps / this.steps.length) * 100 : 0
    };
  }
}

// Utility to create a parallelizable pipeline step
export function createParallelStep<Id extends string, TContext>(
  id: Id,
  run: (context: TContext) => unknown,
  options: { useWorker?: boolean; parallelizable?: boolean; estimatedDuration?: number } = {}
): PipelineStep<Id, TContext> {
  return {
    id,
    run,
    parallelizable: options.parallelizable ?? false,
    useWorker: options.useWorker ?? false,
    estimatedDuration: options.estimatedDuration
  };
}
