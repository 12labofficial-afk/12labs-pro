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

// 📝 Release notes for the version above — rendered as the "What's new"
// list in the update prompt (see AppVersionGate). Update this alongside
// APP_VERSION whenever a version is bumped; it is never shown on its own,
// only as part of that prompt.
export const APP_UPDATE_NOTES: string[] = [
  'Solved payment glitch on some devices',
];
