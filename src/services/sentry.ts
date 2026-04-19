/**
 * Sentry Error Monitoring — lightweight integration.
 * Skips initialization on localhost. Captures unhandled errors + route failures.
 * Requires VITE_SENTRY_DSN environment variable.
 */

let initialized = false;

export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/browser');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // Strip potential PII from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((b) => {
            if (b.category === 'fetch' && b.data?.url) {
              // Redact API keys from URLs
              b.data.url = (b.data.url as string).replace(/apikey=[^&]+/, 'apikey=***');
            }
            return b;
          });
        }
        return event;
      },
    });
    initialized = true;
  } catch {
    // Sentry not available — fail silently
  }
}

export function captureError(err: unknown): void {
  if (!initialized) return;
  import('@sentry/browser')
    .then((Sentry) => {
      if (err instanceof Error) {
        Sentry.captureException(err);
      } else {
        Sentry.captureMessage(String(err));
      }
    })
    .catch(() => {});
}
