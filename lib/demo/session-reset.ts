/**
 * Ends the demo's latch-api session. latch-api identifies a browser by its
 * HttpOnly `sid` cookie, which the same-origin `/latch-api` proxy stores on
 * this site, so page script can't clear it and latch-api has no web logout.
 * Expiring it here makes latch-api start a fresh anonymous user on the next
 * request. That matters for "Start a new account": latch-api excludes every
 * passkey the session user already owns from a new registration, so on the
 * same device the old session makes creating a second account fail
 * (InvalidStateError).
 */

export const LATCH_SESSION_COOKIE = "sid";

/**
 * Set-Cookie values that expire every `sid` the browser may hold for this
 * host: latch-api's (host-only, path "/", Lax in dev) and variants other apps
 * on the same host leave behind. On localhost, latch's own Next app uses the
 * same name, as `Secure; SameSite=None` when its extension settings are on,
 * and a plain expiry doesn't replace a Secure cookie. Cookies are shared
 * across ports, so all of these can coexist on localhost.
 */
export function sessionExpiryCookies(url: URL): string[] {
  const expired = `${LATCH_SESSION_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`;
  // Secure cookies can be replaced on https, and on http://localhost (a secure context).
  const secureAllowed = url.protocol === "https:" || url.hostname === "localhost";
  const variants = [`${expired}; Path=/; SameSite=Lax`, `${expired}; Path=/latch-api; SameSite=Lax`, `${expired}; Path=/; Domain=${url.hostname}; SameSite=Lax`];
  if (secureAllowed) {
    variants.push(`${expired}; Path=/; Secure; SameSite=None`, `${expired}; Path=/; Domain=${url.hostname}; Secure; SameSite=None`);
  }
  return variants;
}

export function handleSessionReset(request: Request): Response {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  // Only this site's own page may ask (the demo calls it with fetch).
  if (origin !== null && origin !== url.origin) {
    return new Response(null, { status: 403 });
  }
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of sessionExpiryCookies(url)) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 204, headers });
}
