import { getWaitlistConsentVersion } from "@/lib/waitlist/config";
import { handleWaitlistSignupRequest } from "@/lib/waitlist/signup-route";
import { getWaitlistStore } from "@/lib/waitlist/store";

export async function POST(request: Request): Promise<Response> {
  return handleWaitlistSignupRequest(request, {
    getStore: getWaitlistStore,
    getConsentVersion: getWaitlistConsentVersion,
    reportFailure(kind) {
      console.error(`[waitlist] signup processing failed: ${kind}`);
    },
  });
}
