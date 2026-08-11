import * as Sentry from "@sentry/react";

// Mirrors server/monitoring.ts's shape and rationale: fully inert unless a
// DSN is configured (VITE_SENTRY_DSN, baked in at build time since Vite
// only exposes VITE_-prefixed env vars to client code), and gated through
// its own `enabled` flag rather than trusting Sentry's no-client no-op so
// this stays easy to unit test.
let enabled = false;

export function initErrorMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0, environment: import.meta.env.MODE });
  enabled = true;
}

export function captureException(error: unknown, componentStack?: string): void {
  if (!enabled) return;
  Sentry.captureException(error, componentStack ? { extra: { componentStack } } : undefined);
}

// Test-only: lets monitoring.test.ts exercise both branches of the gate.
export function _resetForTests(): void {
  enabled = false;
}
