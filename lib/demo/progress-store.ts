import { parseProgress, PROGRESS_STORAGE_KEY, serializeProgress, type SavedProgress } from "./progress";

/**
 * Saved progress in localStorage, degrading to memory when storage throws
 * (private mode, quota, disabled cookies). Framework-free so it can be tested
 * with a fake storage; use-demo-progress.ts wraps it for React.
 */
export interface ProgressStore {
  read(): SavedProgress | null;
  write(progress: SavedProgress | null): void;
  subscribe(listener: () => void): () => void;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createProgressStore(getStorage: () => StorageLike | null): ProgressStore {
  let memory: string | null = null;
  /** Once a write fails, stop trusting storage for this page view. */
  let useMemory = false;
  const listeners = new Set<() => void>();
  let lastRaw: string | null | undefined;
  let lastParsed: SavedProgress | null = null;

  function readRaw(): string | null {
    if (useMemory) return memory;
    try {
      const storage = getStorage();
      return storage ? storage.getItem(PROGRESS_STORAGE_KEY) : memory;
    } catch {
      useMemory = true;
      return memory;
    }
  }

  function emit() {
    listeners.forEach((listener) => listener());
  }

  return {
    read() {
      const raw = readRaw();
      // Same raw value, same object: useSyncExternalStore needs a stable snapshot.
      if (raw !== lastRaw) {
        lastRaw = raw;
        lastParsed = parseProgress(raw);
      }
      return lastParsed;
    },
    write(progress) {
      const raw = progress ? serializeProgress(progress) : null;
      memory = raw;
      if (!useMemory) {
        try {
          const storage = getStorage();
          if (!storage) useMemory = true;
          else if (raw === null) storage.removeItem(PROGRESS_STORAGE_KEY);
          else storage.setItem(PROGRESS_STORAGE_KEY, raw);
        } catch {
          useMemory = true;
        }
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === PROGRESS_STORAGE_KEY) listener();
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
}
