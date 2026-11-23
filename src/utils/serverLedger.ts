/**
 * There is one public ledger: the server-rendered `/ledger` (api/ledger.ts).
 *
 * WHY. Every ledger link on the site was a hash route, so a reader who clicked
 * through from the landing page got the SPA renderer in src/pages/ledger.ts,
 * not the page search engines, shared links and direct visits get. The two had
 * drifted: the SPA one was on the light email palette, printed "calls that
 * landed" twice, had a broken corrections heading, and lacked the retirement
 * section and the corrected censorship score. The server page carries all of
 * those and calls itself canonical.
 *
 * So the SPA's /ledger and /accuracy routes hand the reader to the server page
 * with a full load. That covers every legacy `#/ledger` link at once —
 * in-app, bookmarked, and the one in each sent email — without editing them.
 *
 * THE LOOP GUARD. If the document was itself served at /ledger, the host has
 * no rewrite to api/ledger (vite dev or preview, or the service worker's
 * offline fallback). Reloading /ledger would serve this app again and loop, so
 * the caller's fallback runs instead.
 */
export const SERVER_LEDGER_PATH = '/ledger';

export function openServerLedger(servedAtPath: string, replace: (url: string) => void, fallback: () => void): void {
  if (servedAtPath.replace(/\/+$/, '') === SERVER_LEDGER_PATH) {
    fallback();
    return;
  }
  replace(SERVER_LEDGER_PATH);
}
