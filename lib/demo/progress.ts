/**
 * Saved progress for /demo. Pure functions only (no React, no storage) so
 * they can be unit-tested; the hook lives in use-demo-progress.ts.
 */

/** How far the visitor got: 0 nothing, 1 account created, 2 funded, 3 spending limit set, 4 first send. */
export type DemoStep = 0 | 1 | 2 | 3 | 4;

export const LAST_STEP: DemoStep = 4;

export interface SavedProgress {
  step: DemoStep;
  /** The smart account's C-address. Required once an account exists (step >= 1). */
  accountAddress: string | null;
  /** ms since epoch of the last write. */
  updatedAt: number;
}

/** Versioned so a future shape change can ignore old saves instead of misreading them. */
export const PROGRESS_STORAGE_KEY = "latch-demo-progress-v1";

export function isDemoStep(value: unknown): value is DemoStep {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= LAST_STEP;
}

/** Parses a stored value; anything malformed or inconsistent counts as "no progress". */
export function parseProgress(raw: string | null): SavedProgress | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { step, accountAddress, updatedAt } = value as Record<string, unknown>;
  if (!isDemoStep(step)) return null;
  if (accountAddress !== null && typeof accountAddress !== "string") return null;
  if (step >= 1 && !accountAddress) return null; // past create but no account: unusable
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  return { step, accountAddress: step === 0 ? null : accountAddress, updatedAt };
}

export function serializeProgress(progress: SavedProgress): string {
  return JSON.stringify(progress);
}

/**
 * Dev-only `?step=N` override for screenshots and QA. Returns null in
 * production builds no matter what the URL says.
 */
export function parseStepOverride(search: string, nodeEnv: string | undefined): DemoStep | null {
  if (nodeEnv === "production") return null;
  const raw = new URLSearchParams(search).get("step");
  if (raw === null || !/^[0-4]$/.test(raw)) return null;
  return Number(raw) as DemoStep;
}

/**
 * Step implied by what is on chain, for "Sign in" on a device with no saved
 * progress: a rule with usage means 04 is done, a rule means 03, a balance 02.
 */
export function inferStepFromChain(state: { balanceStroops: bigint; rule: unknown; usedStroops: bigint }): DemoStep {
  if (state.rule && state.usedStroops > BigInt(0)) return 4;
  if (state.rule) return 3;
  if (state.balanceStroops > BigInt(0)) return 2;
  return 1;
}
