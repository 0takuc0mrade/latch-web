/**
 * Saved progress and reveal rules for /demo. Pure functions only (no React,
 * no storage) so they can be unit-tested; the hook lives in use-demo-progress.ts.
 */

/** Finished chapters: 0 nothing, 1 create, 2 fund, 3 rule, 4 try it. */
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

export type ChapterId = "fund" | "rule" | "try";
export type ChapterState = "hidden" | "now" | "done";

/**
 * Hero CTA: "pending" while saved progress has not been read yet (SSR and
 * hydration), so a returning visitor never sees "Create account" flash first.
 */
export type HeroCta = "pending" | "create" | "continue" | "done";

export interface RevealState {
  heroCta: HeroCta;
  /** Right column shows the account card (true) or the preview card (false). */
  heroAccountCard: boolean;
  chapters: Record<ChapterId, ChapterState>;
  /** 05 How it works, 06 Your journey, 07 Why Smart Accounts. */
  showClosing: boolean;
}

const CHAPTER_ORDER: readonly ChapterId[] = ["fund", "rule", "try"];

/**
 * The canvas logic from latch-demo-design (renderVals), as a pure function.
 * `revealed` is false for a returning visitor until they press Continue.
 */
export function computeReveal(input: { hydrated: boolean; step: DemoStep; revealed: boolean }): RevealState {
  const { hydrated, step, revealed } = input;
  const chapters = {} as Record<ChapterId, ChapterState>;
  CHAPTER_ORDER.forEach((id, index) => {
    const chapterStep = index + 2; // fund finishes step 2, rule 3, try 4
    const visible = hydrated && revealed && step >= chapterStep - 1;
    chapters[id] = !visible ? "hidden" : step >= chapterStep ? "done" : "now";
  });

  let heroCta: HeroCta;
  if (!hydrated) heroCta = "pending";
  else if (!revealed) heroCta = "continue";
  else heroCta = step === 0 ? "create" : "done";

  return {
    heroCta,
    heroAccountCard: hydrated && revealed && step >= 1,
    chapters,
    showClosing: hydrated && revealed && step >= LAST_STEP,
  };
}

/** The chapter that is "now", or null (create is next, or everything is done). */
export function currentChapter(reveal: RevealState): ChapterId | null {
  return CHAPTER_ORDER.find((id) => reveal.chapters[id] === "now") ?? null;
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
