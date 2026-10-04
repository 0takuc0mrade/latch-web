# latch-web

Hosts `uselatch.app`: the Latch landing page, and the passkey relying-party
proof files every Latch client (mobile, web, extension) depends on.

## `public/.well-known/`

`assetlinks.json` and `apple-app-site-association` are what let Android and
iOS trust this domain for passkeys. They must always return **HTTP 200
directly** (no redirect) as `application/json`, with no auth in front of
them. `scripts/check-well-known.mjs` runs before every build and fails it if
either file is missing or doesn't list the expected app identifiers — see
`CODEOWNERS`.

Content is copied verbatim from the values already live at
`michaelesenwa.me`; do not hand-edit the certificate fingerprints or app IDs
without checking against `latch-mobile`'s
`docs/passkey-sync-and-recovery-findings.md`.

## `/passkey-bridge`

Reserved for the browser extension's passkey ceremony bridge. Not wired up
yet — see Discussion #32 in the org.

## Development

```bash
bun install
bun run dev
```

`bun run build` runs the `.well-known` integrity check first and fails loudly
if it doesn't pass.

## Web Analytics

The homepage uses Vercel Web Analytics through `@vercel/analytics/next`.
Enable Web Analytics in the Vercel project's Analytics tab before deploying
this integration. No additional environment variables or API keys are needed.

Only homepage events are recorded. Query parameters and URL fragments are
removed before sending; confirmation, unsubscribe, and passkey pages are
excluded. Development mode logs analytics events locally rather than
recording production traffic.

## Native waitlist backend

The waitlist API uses Neon Postgres through Drizzle. The homepage posts signups
to the native API, and a successful request subscribes the address immediately;
there is no confirmation email or additional confirmation step.

### Server environment

Configure these values in the local shell or deployment environment. Never
prefix them with `NEXT_PUBLIC_` or commit real values.

```text
DATABASE_URL=postgresql://runtime-user:password@host/database?sslmode=require
DATABASE_MIGRATION_URL=postgresql://migration-user:password@host/database?sslmode=require
WAITLIST_UNSUBSCRIBE_SECRET=generate-at-least-32-random-bytes
WAITLIST_CONSENT_VERSION=road-to-mainnet-v1
```

Generate the unsubscribe secret with a cryptographically secure tool, for
example `openssl rand -base64 32`.

Use a pooled, least-privileged Neon connection for `DATABASE_URL`. Keep the
owner or migration connection separate in `DATABASE_MIGRATION_URL` and apply
migrations explicitly rather than during a Next.js build:

```bash
bun run db:generate
bun run db:migrate
```

The checked-in SQL under `drizzle/` is the deployable migration artifact.

### API contract

The endpoints accept JSON only and limit the request body to 1 KiB:

```text
POST /api/waitlist              { "email": "person@example.com" }
POST /api/waitlist/confirm      { "token": "confirmation-token" }
POST /api/waitlist/unsubscribe  { "token": "signed-unsubscribe-token" }
```

`POST /api/waitlist/confirm` and its page remain available only for confirmation
links issued before the direct-signup change. New signups do not create or send
confirmation tokens. No endpoint mutates subscriber state on `GET`.

Configure a Vercel WAF fixed-window rate limit for `POST /api/waitlist` before
launch. A successful signup returns HTTP `200` with the same response for new
and already-subscribed addresses. Database or configuration failures return a
generic HTTP `503` response so the UI never claims that an address was stored
when it was not.
