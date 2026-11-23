/**
 * Client-readable demo configuration. Direct `process.env.NEXT_PUBLIC_*` reads
 * so Next inlines them at build time. All values are optional; the mock adapter
 * needs none of them.
 */

/**
 * Base URL of the app that hosts `/api/demo/fund` (the older playground app).
 * Unset until that deployment's URL is known: see PR_NOTES.md item 12.
 */
export const DEMO_FUND_URL = (process.env.NEXT_PUBLIC_DEMO_FUND_URL ?? "").replace(/\/+$/, "");
