import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToast } from "@/hooks/use-toast";

// Apple rejects apps that let a user unlock paid features through a
// payment flow other than in-app purchase (guideline 3.1.1) — startCheckout
// has to behave differently when Capacitor reports the app is running
// natively (iOS/Android) versus in a normal web browser.
const { isNativePlatformMock } = vi.hoisted(() => ({ isNativePlatformMock: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock },
}));

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: apiRequestMock,
}));

import { startCheckout } from "./billing";

describe("startCheckout", () => {
  beforeEach(() => {
    isNativePlatformMock.mockReset();
    apiRequestMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an in-app message instead of hitting the Stripe API when running as a native app", async () => {
    isNativePlatformMock.mockReturnValue(true);
    const { result } = renderHook(() => useToast());

    await act(async () => {
      await startCheckout();
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(result.current.toasts[0]?.title).toBe("Upgrade from a browser");
  });

  it("starts real Stripe Checkout on the web", async () => {
    isNativePlatformMock.mockReturnValue(false);
    apiRequestMock.mockResolvedValue({ json: async () => ({ url: "https://checkout.stripe.com/session123" }) });
    // jsdom logs (but doesn't throw on) unimplemented navigation when code
    // assigns location.href — stub it out so the assignment is just a
    // recorded value, keeping this test's output clean either way.
    const locationStub = { href: "" };
    vi.stubGlobal("location", locationStub);

    await startCheckout();

    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/checkout");
    expect(locationStub.href).toBe("https://checkout.stripe.com/session123");
  });
});
