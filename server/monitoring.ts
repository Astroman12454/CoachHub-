import * as Sentry from "@sentry/node";

// The app has always run fine with no error-tracking service configured
// (see .env.example) — every optional integration here degrades the same
// way. This one's no different: initErrorMonitoring() is a no-op unless
// SENTRY_DSN is set, so nothing changes for a deploy that hasn't opted in.
// `enabled` (rather than trusting Sentry's own no-client no-op behavior)
// keeps "did this actually go anywhere" answerable from this one file, and
// easy to unit test without needing a real DSN.
let enabled = false;

export function initErrorMonitoring(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  // No performance tracing (tracesSampleRate: 0) — this is only wired up
  // to catch unhandled errors (see server/index.ts's global error
  // middleware and unhandledRejection handler), not to profile requests.
  Sentry.init({ dsn, tracesSampleRate: 0, environment: process.env.NODE_ENV });
  enabled = true;
}

export function captureException(error: unknown): void {
  if (!enabled) return;
  Sentry.captureException(error);
}

// Test-only: lets monitoring.test.ts exercise both branches of the gate
// without a real Sentry.init having leaked state from a previous case.
export function _resetForTests(): void {
  enabled = false;
}
