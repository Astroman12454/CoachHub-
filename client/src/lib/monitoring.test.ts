import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/react";
import { initErrorMonitoring, captureException, _resetForTests } from "./monitoring";

describe("client error monitoring", () => {
  beforeEach(() => {
    _resetForTests();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SENTRY_DSN", "");
  });

  it("stays fully inert with no VITE_SENTRY_DSN set", () => {
    initErrorMonitoring();
    expect(Sentry.init).not.toHaveBeenCalled();

    captureException(new Error("boom"));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("initializes Sentry and forwards exceptions once VITE_SENTRY_DSN is set", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://example@sentry.io/1");
    initErrorMonitoring();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://example@sentry.io/1" }));

    const error = new Error("boom");
    captureException(error, "at <App>");
    expect(Sentry.captureException).toHaveBeenCalledWith(error, { extra: { componentStack: "at <App>" } });
  });

  it("never forwards exceptions before init has run, even with a DSN configured", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://example@sentry.io/1");
    captureException(new Error("too early"));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
