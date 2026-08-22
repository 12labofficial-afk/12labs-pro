# Security audit — Studio12Labs ZIP

**Scope:** `attached_assets/n_1787402904598.zip` (source review only; no production
credentials or live Firebase/R2 access was available).

## Verdict

Do **not** treat the current build as safe for public launch. There are multiple
high-impact authorization and cost-control gaps. The most serious ones allow an
unauthenticated caller to mint Firebase custom tokens, call paid AI generation
paths without a server-side identity check, and read secure storage objects.

## Critical findings

### C1 — Unauthenticated custom-token minting

**File:** `src/app/api/auth/custom-token/route.ts`

If no valid Bearer token or API key is supplied, the route accepts a caller
provided `uid` and creates a custom Firebase token for it. This is account
impersonation and can become full data access under the Firebase rules. The
returned token is also exposed directly to the caller.

**Required fix:** require and verify a Firebase ID token (or a separately
authenticated, rate-limited API-key flow); never trust a body `uid`; remove
the permissive CORS policy.

### C2 — Paid AI generation is callable without authorization or billing

**Files:** `src/app/studio/actions.ts`,
`src/app/new-ai-studio/actions.ts`, `src/app/api/text-to-video/route.ts`,
`src/app/api/generate-text/route.ts`

The server actions accept `userId`, `userEmail`, and generation inputs from the
client but do not verify the caller's Firebase identity. The TTS actions perform
generation independently from deduction. A caller can invoke the generation
action directly and skip the UI's credit deduction. The video and text API
routes have no authentication or quota check at all.

**Required fix:** authenticate every server action/API route, derive the UID
from the verified token, and make debit + job creation a single idempotent
server transaction before dispatching AI work.

### C3 — Client-controlled credit price

**File:** `src/app/studio/actions.ts`

`deductFastGenCreditsAction` accepts `customCost` from the client and uses it
when it is a positive number. A user can submit a very low cost for an
expensive generation. The same general pattern exists in several credit
actions where the caller supplies identity/project data.

**Required fix:** compute cost only from server-validated text/settings and
server-owned pricing; ignore client cost values entirely.

### C4 — Secure R2 assets are publicly readable

**Files:** `src/app/api/storage/[...path]/route.ts`,
`src/app/api/public-storage/[...path]/route.ts`,
`src/app/api/download/route.ts`

The storage proxy has no authentication and tries both `secure/` and
`public/` key variants. The public proxy also tries `secure/`. The download
route accepts an arbitrary URL and fetches it server-side. This enables
unauthorized access to private audio/files, an open download proxy, and
potential SSRF against reachable internal endpoints.

**Required fix:** remove secure-key fallback from public routes; require an
authenticated owner or short-lived signed URL for secure objects; allowlist
storage hosts; enforce size/content-type/time limits; do not fetch arbitrary
URLs.

### C5 — Unauthenticated upload with caller-selected owner/path

**File:** `src/app/api/upload/route.ts`

The route has no authentication, accepts `userId`, `bucketType`, and `folder`
from request parameters, has no size limit or MIME/content validation, and
allows writes into the `secure` namespace. It can be abused for storage
exhaustion and arbitrary object placement.

**Required fix:** authenticate, derive user ID server-side, allowlist folders,
restrict bucket selection, enforce a small upload limit, validate magic bytes,
and use randomized server-generated names.

## High findings

### H1 — RTDB project edits and editing jobs are cross-user readable/writable

**File:** `database.rules.json`

`projectEdits/$projectId` is readable and writable by any signed-in user.
`editingjobs` is also readable and writable by any signed-in user. This permits
project/audio metadata tampering and cross-user data exposure.

**Required fix:** bind each record to `auth.uid` and enforce ownership on both
read and write; keep job writes server-only where possible.

### H2 — Server actions trust caller-supplied identity and project ownership

**Files:** `src/app/studio/actions.ts`,
`src/app/new-ai-studio/actions.ts`, `src/app/script-generator/actions.ts`,
`src/app/seo-kit/actions.ts`

Several actions use a supplied `userId` to read/update balances and write
projects. Next server actions are not a substitute for authorization. The
Firestore rules do not protect Admin SDK writes, so the action itself must
verify the caller.

**Required fix:** add one shared `requireAuthenticatedUser()` helper that
verifies the Firebase ID token from the request, compare/derive the UID, and
use it in every action. Check project ownership before edits/deletes.

### H3 — Trial-credit race condition and split billing

**File:** `src/app/new-ai-studio/actions.ts`

Trial balance is read and updated outside a transaction, while generation and
debit are separate operations. Concurrent requests can consume the same trial
balance more than once, and a generation can succeed even if a later debit
fails.

**Required fix:** use a Firestore transaction or a server-side ledger with an
idempotency key; reserve credits atomically, then dispatch exactly once.

### H4 — Client secret exposure in production bundle

**Files:** `next.config.js`, `.env.example`

`NEXT_PUBLIC_HF_TOKEN`, `NEXT_PUBLIC_H1`, `NEXT_PUBLIC_H2`, `NEXT_PUBLIC_H3`,
and `NEXT_PUBLIC_C2` are explicitly populated from secret-looking environment
variables. Anything under `NEXT_PUBLIC_*` is browser-visible.

**Required fix:** remove these mappings and rotate any values that have ever
been deployed. Keep HF/API/R2/Telegram credentials server-side only.

### H5 — User profile creation trusts a client UID

**File:** `src/app/actions.ts`

`createNewUserProfileOnServer` accepts a user object and UID from the client.
It should verify the Firebase token and use its UID, otherwise arbitrary
profile creation/initial-credit logic can be targeted.

## Additional hardening

- Add rate limits and abuse detection per UID, IP, and device for all AI routes.
- Add maximum text, image, and response sizes to every generation endpoint.
- Use strict CORS; never use `Access-Control-Allow-Origin: *` on authenticated
  or paid routes.
- Turn off `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds`;
  security checks must fail the build.
- Ensure production Firebase rules deploy from one canonical file. The ZIP has
  both root and `src/` rule files, which creates deployment drift risk.
- Do not log full user text, email, or media URLs to Telegram unless required;
  treat these as potentially sensitive.
- Add tests for: cross-user reads/writes, forged UID, zero/low custom cost,
  duplicate request IDs, direct unauthenticated generation, secure object
  access, and upload limits.

## Priority order

1. Disable/fix custom-token route, upload, storage, download, text, and video
   endpoints or put them behind authentication immediately.
2. Add shared server-side authentication and ownership checks to every action.
3. Replace client-controlled pricing and split credit/generation flow with an
   atomic, idempotent server ledger.
4. Lock RTDB ownership rules and rotate any secret that was exposed through
   `NEXT_PUBLIC_*` or deployed logs.