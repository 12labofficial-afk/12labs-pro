// 🔇 Known-benign client noise — errors that fire in normal use but
// indicate nothing actually broken, so reporting them to Telegram just
// creates unactionable spam. Shared between reportClientError (explicit
// catch-block reports) and GlobalErrorReporter (uncaught errors/rejections)
// so a string only needs to be listed once.
export const IGNORED_ERROR_SUBSTRINGS = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  // Firebase Auth SDK internal race in its popup sign-in event manager —
  // fires from Firebase's own minified code (not ours) after a Google
  // Sign-In popup flow settles and the SDK's internal deferred promise for
  // it has already been cleared (e.g. popup closed, or a second popup
  // attempt raced the first). Sign-in itself still completes fine.
  'INTERNAL ASSERTION FAILED: Pending promise was never set',
  // Next.js's own Server Action transport error — thrown client-side when
  // a Server Action's fetch response isn't a valid RSC payload. In
  // practice this fires when the user navigates away (or the tab is
  // backgrounded/network drops) while the action request is still in
  // flight, so the browser hands Next.js a cancelled/garbled response.
  // Not something app code can catch or prevent, and the action either
  // already completed server-side or the user has moved on regardless.
  'An unexpected response was received from the server',
  // HTMLMediaElement's own documented behavior (not a bug): calling
  // .pause() (or starting a new .play()) while a previous .play() promise
  // is still pending rejects that promise with this exact message. Fires
  // constantly on any audio/video player where the user can switch tracks
  // or toggle play/pause quickly (music-library, Studio voice preview,
  // sound-search, etc.) — every one of those call sites already has its
  // own .catch(), so this is always already handled, never uncaught.
  'The play() request was interrupted by a call to pause()',
];

export function isIgnorableError(message: string): boolean {
  return IGNORED_ERROR_SUBSTRINGS.some((s) => message.includes(s));
}
