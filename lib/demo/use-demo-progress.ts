"use client";

import { useCallback, useSyncExternalStore } from "react";
import { type DemoStep, type SavedProgress } from "./progress";
import { createProgressStore } from "./progress-store";

const store = createProgressStore(() => (typeof window === "undefined" ? null : window.localStorage));

/** Sentinel for "not read yet" (server render and hydration). */
const NOT_HYDRATED = Symbol("not-hydrated");
type Snapshot = SavedProgress | null | typeof NOT_HYDRATED;

const getServerSnapshot = (): Snapshot => NOT_HYDRATED;

export interface DemoProgress {
  /** False during SSR and hydration: render a neutral hero CTA until it flips. */
  hydrated: boolean;
  progress: SavedProgress | null;
  save: (step: DemoStep, accountAddress: string | null) => void;
  clear: () => void;
}

/**
 * Saved demo progress ({ step, accountAddress, updatedAt } under a versioned
 * localStorage key). Reads only after mount, so the server HTML and the first
 * client render agree, and survives storage being unavailable.
 */
export function useDemoProgress(): DemoProgress {
  const snapshot = useSyncExternalStore<Snapshot>(store.subscribe, store.read, getServerSnapshot);

  const save = useCallback((step: DemoStep, accountAddress: string | null) => {
    store.write({ step, accountAddress: step === 0 ? null : accountAddress, updatedAt: Date.now() });
  }, []);
  const clear = useCallback(() => store.write(null), []);

  return {
    hydrated: snapshot !== NOT_HYDRATED,
    progress: snapshot === NOT_HYDRATED ? null : snapshot,
    save,
    clear,
  };
}
