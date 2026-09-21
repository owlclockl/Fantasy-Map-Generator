// Desktop file handoff: .map files opened from Explorer, the File menu, or a second app
// launch are read by the main process and queued; this side pulls them over the preload
// bridge and loads them through the same pipeline as a picked file. `Services` is used
// as a global (see services/index.ts) to keep this module out of the import graph cycles
import { tip } from "@/components/tooltips";
import { isElectron } from "@/services/platform";

let subscribed = false;

/** Listen for files arriving while the app runs. Called once, before the start-up load decision */
export function subscribeToMapFiles(): void {
  if (subscribed || !isElectron()) return;
  const unsubscribe = window.electron?.onOpenMapFile?.(() => void consumePendingMapFile());
  if (!unsubscribe) return;
  subscribed = true;
}

/** Load the oldest file the main process queued, if any. Reports whether one was found */
export async function consumePendingMapFile(): Promise<boolean> {
  if (!isElectron()) return false;
  try {
    const file = await window.electron?.getPendingMapFile?.();
    if (!file) return false;
    WARN && console.warn("Loading map file from desktop:", file.name);
    Services.Load.uploadMap(new Blob([file.data]));
    return true;
  } catch (error) {
    ERROR && console.error(error);
    tip("Cannot open the map file", true, "error", 3000);
    return false;
  }
}
