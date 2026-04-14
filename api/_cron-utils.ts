/**
 * Shared cron utilities.
 *
 * Vercel cron schedules don't support random jitter, so we add it
 * inside the handler. This prevents thundering-herd when multiple
 * crons fire at the top of the minute and all try to hit the same
 * upstream APIs simultaneously.
 *
 * Typical usage:
 *   export default async function handler(req, res) {
 *     await cronJitter(30); // wait 0-30s before proceeding
 *     ...
 *   }
 */

/**
 * Sleep for a random time between 0 and maxSeconds.
 * Use at the top of cron handlers to stagger execution.
 */
export function cronJitter(maxSeconds = 30): Promise<void> {
  const ms = Math.floor(Math.random() * maxSeconds * 1000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
