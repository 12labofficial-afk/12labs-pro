// 🔢 Site-wide version gate. Bumped ONLY when explicitly asked to — this is
// NOT tied to deploys, and a normal code push that doesn't touch this file
// has zero effect on it. See src/components/app-version-gate.tsx for what
// bumping it actually does: every already-open tab still running the OLD
// value (baked into its JS bundle at build time) starts polling
// /api/version (always live, never cached) and gets shown an "update
// available" prompt once it sees this NEW value — pushing them onto a
// fresh reload before they ever hit a stale-chunk "Failed to fetch" from
// a deleted old build file.
export const APP_VERSION = '2.2.3';
