import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSaveMutation } from "./use-save-mutation";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useSaveMutation", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the endpoint when no id is given (create)", async () => {
    const fetchMock = mockFetchOnce({ id: 1, name: "Test" });
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useSaveMutation<{ name: string }>({
          endpoint: "/api/exercises",
          successMessage: "created",
          errorMessage: "failed",
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ name: "Test" });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exercises",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("PUTs to endpoint/id when an id is given (edit)", async () => {
    const fetchMock = mockFetchOnce({ id: 7, name: "Updated" });
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useSaveMutation<{ name: string }>({
          endpoint: "/api/exercises",
          id: 7,
          successMessage: "updated",
          errorMessage: "failed",
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ name: "Updated" });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exercises/7",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("invalidates the endpoint and /api/stats queries, and fires onSuccess, after a successful save", async () => {
    mockFetchOnce({ id: 1 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useSaveMutation<{ name: string }>({
          endpoint: "/api/exercises",
          successMessage: "created",
          errorMessage: "failed",
          onSuccess,
        }),
      { wrapper },
    );

    result.current.mutate({ name: "Test" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey[0],
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining(["/api/exercises", "/api/stats"]),
    );
  });

  it("also invalidates any extraInvalidateKeys on success", async () => {
    mockFetchOnce({ id: 1 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useSaveMutation<{ name: string }>({
          endpoint: "/api/training-sessions",
          successMessage: "created",
          errorMessage: "failed",
          extraInvalidateKeys: ["/api/attendance/session"],
        }),
      { wrapper },
    );

    result.current.mutate({ name: "Test" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey[0],
    );
    expect(invalidatedKeys).toContain("/api/attendance/session");
  });

  it("surfaces an error state and does not invalidate queries when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Server error", { status: 500 })),
    );
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useSaveMutation<{ name: string }>({
          endpoint: "/api/exercises",
          successMessage: "created",
          errorMessage: "failed",
        }),
      { wrapper },
    );

    result.current.mutate({ name: "Test" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
