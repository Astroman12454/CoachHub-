import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./use-auth";
import { getQueryFn } from "@/lib/queryClient";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Mirrors the app's real QueryClient default queryFn so /api/session
      // resolves the same way it does in production.
      queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts loading, then reflects an authenticated session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ authenticated: true })),
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("reflects an unauthenticated session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ authenticated: false })),
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("login() flips isAuthenticated to true on a correct passcode", async () => {
    // Stateful, like the real server: /api/session reflects whatever the
    // last login/logout call set, since queryClient.clear() in the auth
    // mutations can trigger a refetch of /api/session after the mutation.
    let authenticated = false;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/session") return Promise.resolve(jsonResponse({ authenticated }));
      if (url === "/api/login") {
        authenticated = true;
        return Promise.resolve(jsonResponse({ authenticated }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login("correct-passcode");
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces loginError when the passcode is rejected, without authenticating", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/session") return Promise.resolve(jsonResponse({ authenticated: false }));
      if (url === "/api/login") return Promise.resolve(jsonResponse({ message: "Incorrect passcode" }, 401));
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("wrong-passcode").catch(() => {});
    });

    await waitFor(() => expect(result.current.loginError).toBe("Passcode incorrecto"));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("logout() flips isAuthenticated back to false", async () => {
    let authenticated = true;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/session") return Promise.resolve(jsonResponse({ authenticated }));
      if (url === "/api/logout") {
        authenticated = false;
        return Promise.resolve(jsonResponse({ authenticated }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
  });

  it("throws when used outside an AuthProvider", () => {
    // Swallow the expected React error-boundary console noise for this case.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
    consoleSpy.mockRestore();
  });
});
