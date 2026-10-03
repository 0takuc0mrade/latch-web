import "server-only";

export class WaitlistConfigurationError extends Error {
  constructor(name: string) {
    super(`Missing or invalid server configuration: ${name}`);
    this.name = "WaitlistConfigurationError";
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new WaitlistConfigurationError(name);
  }

  return value;
}

export function getDatabaseUrl(): string {
  return required("DATABASE_URL");
}

export function getWaitlistConsentVersion(): string {
  const version = required("WAITLIST_CONSENT_VERSION");

  if (version.length > 100) {
    throw new WaitlistConfigurationError("WAITLIST_CONSENT_VERSION");
  }

  return version;
}

export function getUnsubscribeSecret(): string {
  const secret = required("WAITLIST_UNSUBSCRIBE_SECRET");

  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new WaitlistConfigurationError("WAITLIST_UNSUBSCRIBE_SECRET");
  }

  return secret;
}
