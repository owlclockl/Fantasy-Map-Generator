// Compute worker - handles heavy calculations off main thread
import { executeTask } from "./task-executor";

export type WorkerTaskMessage = {
  id: string;
  type: string;
  payload: any;
};

export type WorkerResultMessage = {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
};

self.onmessage = async (e: MessageEvent<WorkerTaskMessage>) => {
  const task = e.data;

  if (!task?.id || !task.type) {
    const result: WorkerResultMessage = {
      id: task?.id || "unknown",
      success: false,
      error: "Invalid task format"
    };
    self.postMessage(result);
    return;
  }

  try {
    const resultData = await executeTask(task);

    // Handle transferable objects if needed
    let transfer: Transferable[] = [];
    if (resultData instanceof ArrayBuffer) {
      transfer = [resultData];
    } else if (ArrayBuffer.isView(resultData)) {
      // For typed arrays, transfer the buffer
      transfer = [resultData.buffer as ArrayBuffer];
    } else if (resultData && typeof resultData === "object") {
      // Check for transferable properties
      for (const key in resultData) {
        const value = resultData[key];
        if (value instanceof ArrayBuffer) {
          transfer.push(value);
        } else if (ArrayBuffer.isView(value)) {
          transfer.push(value.buffer as ArrayBuffer);
        }
      }
    }

    const response: WorkerResultMessage = {
      id: task.id,
      success: true,
      result: resultData
    };

    if (transfer.length > 0) {
      self.postMessage(response, transfer as any);
    } else {
      self.postMessage(response);
    }
  } catch (error) {
    const response: WorkerResultMessage = {
      id: task.id,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    self.postMessage(response);
  }
};

// Signal that worker is ready
self.postMessage({ type: "worker:ready", id: "init" });
