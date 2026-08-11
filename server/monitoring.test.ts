import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/node";
import { initErrorMonitoring, captureException, _resetForTests } from "./monitoring";

describe("server error monitoring", () => {
  const originalDsn = process.env.SENTRY_DSN;

  beforeEach(() => {
    _resetForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
  });

  it("stays fully inert with no SENTRY_DSN set", () => {
    delete process.env.SENTRY_DSN;
    initErrorMonitoring();
    expect(Sentry.init).not.toHaveBeenCalled();

    captureException(new Error("boom"));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("initializes Sentry and forwards exceptions once SENTRY_DSN is set", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1";
    initErrorMonitoring();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://example@sentry.io/1" }));

    const error = new Error("boom");
    captureException(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("never forwards exceptions before init has run, even with a DSN configured", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1";
    // initErrorMonitoring() deliberately not called — mirrors a caller
    // that imports captureException without having initialized first.
    captureException(new Error("too early"));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
