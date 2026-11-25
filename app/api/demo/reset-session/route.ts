import { handleSessionReset } from "@/lib/demo/session-reset";

/** POST: forget the demo's latch-api session (lib/demo/session-reset.ts). */
export function POST(request: Request): Response {
  return handleSessionReset(request);
}
