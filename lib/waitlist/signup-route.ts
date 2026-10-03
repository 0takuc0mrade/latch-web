import {
  InvalidJsonBodyError,
  readJsonObject,
  RequestBodyTooLargeError,
  UnsupportedContentTypeError,
  waitlistJson,
} from "./request";
import {
  InvalidWaitlistEmailError,
  requestWaitlistSignup,
  WAITLIST_ACCEPTED_MESSAGE,
  type WaitlistStore,
} from "./service";
import { normalizeEmail } from "./validation";

const INVALID_REQUEST_MESSAGE = "Enter a valid email address.";
const UNAVAILABLE_MESSAGE = "We could not process your request right now. Please try again.";

export type SignupFailureKind = "database-or-configuration";

export type SignupRouteDependencies = {
  getStore: () => WaitlistStore;
  getConsentVersion: () => string;
  reportFailure: (kind: SignupFailureKind) => void;
};

function acceptedResponse(): Response {
  return waitlistJson({ ok: true, message: WAITLIST_ACCEPTED_MESSAGE }, 200);
}

export async function handleWaitlistSignupRequest(
  request: Request,
  dependencies: SignupRouteDependencies,
): Promise<Response> {
  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    if (error instanceof UnsupportedContentTypeError) {
      return waitlistJson({ ok: false, message: "Content-Type must be application/json." }, 415);
    }

    if (error instanceof RequestBodyTooLargeError) {
      return waitlistJson({ ok: false, message: "Request body is too large." }, 413);
    }

    if (error instanceof InvalidJsonBodyError) {
      return waitlistJson({ ok: false, message: "Invalid request body." }, 400);
    }

    return waitlistJson({ ok: false, message: UNAVAILABLE_MESSAGE }, 503);
  }

  const email = normalizeEmail(body.email);

  if (!email) {
    return waitlistJson({ ok: false, message: INVALID_REQUEST_MESSAGE }, 400);
  }

  try {
    await requestWaitlistSignup(
      {
        store: dependencies.getStore(),
        consentVersion: dependencies.getConsentVersion(),
      },
      email,
    );
  } catch (error) {
    if (error instanceof InvalidWaitlistEmailError) {
      return waitlistJson({ ok: false, message: INVALID_REQUEST_MESSAGE }, 400);
    }

    try {
      dependencies.reportFailure("database-or-configuration");
    } catch {
      // Observability must never replace the safe public error response.
    }

    return waitlistJson({ ok: false, message: UNAVAILABLE_MESSAGE }, 503);
  }

  return acceptedResponse();
}
