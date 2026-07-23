import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useDeleteWithUndo } from "./use-delete-with-undo";
import { useToast } from "@/hooks/use-toast";

// undoDelete isn't part of the hook's public return value — the only way a
// real user triggers it is by clicking "Deshacer" on the toast. useToast is
// a module-level singleton store, so a second hook instance sees the same
// toasts array and lets us click that action the same way the UI does.
function grabLatestToastUndo(): () => void {
  const { result: toastResult } = renderHook(() => useToast());
  const latestToast = toastResult.current.toasts[0];
  const action = latestToast.action as ReactElement<{ onClick: () => void }>;
  return action.props.onClick;
}

function clickUndoOnLatestToast() {
  const onClick = grabLatestToastUndo();
  act(() => {
    onClick();
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useDeleteWithUndo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hides the item immediately without calling the server", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useDeleteWithUndo({ endpoint: "/api/exercises", errorMessage: "failed" }),
      { wrapper },
    );

    act(() => {
      result.current.requestDelete(1, "Deleted");
    });

    expect(result.current.isPendingDelete(1)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the DELETE request only once the undo window expires", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useDeleteWithUndo({ endpoint: "/api/exercises", errorMessage: "failed" }),
      { wrapper },
    );

    act(() => {
      result.current.requestDelete(1, "Deleted");
    });

    // Still within the window: nothing sent to the server yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Window expires: the real delete fires now.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exercises/1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result.current.isPendingDelete(1)).toBe(false);
  });

  it("cancels the pending delete when undone before the window expires", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useDeleteWithUndo({ endpoint: "/api/exercises", errorMessage: "failed" }),
      { wrapper },
    );

    act(() => {
      result.current.requestDelete(1, "Deleted");
    });
    expect(result.current.isPendingDelete(1)).toBe(true);

    clickUndoOnLatestToast();
    expect(result.current.isPendingDelete(1)).toBe(false);

    // Even after the window would have expired, no DELETE should ever fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores visibility if the delayed DELETE request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Server error", { status: 500 })),
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useDeleteWithUndo({ endpoint: "/api/exercises", errorMessage: "failed" }),
      { wrapper },
    );

    act(() => {
      result.current.requestDelete(1, "Deleted");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.isPendingDelete(1)).toBe(false);
  });

  it("invalidates the endpoint, /api/stats, and any extraInvalidateKeys once the delete lands", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useDeleteWithUndo({
          endpoint: "/api/training-sessions",
          errorMessage: "failed",
          extraInvalidateKeys: ["/api/attendance/session"],
        }),
      { wrapper },
    );

    act(() => {
      result.current.requestDelete(1, "Deleted");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey[0],
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        "/api/training-sessions",
        "/api/stats",
        "/api/attendance/session",
      ]),
    );
  });

  it("tracks multiple pending deletes independently", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useDeleteWithUndo({ endpoint: "/api/exercises", errorMessage: "failed" }),
      { wrapper },
    );

    // TOAST_LIMIT is 1, so the second requestDelete replaces the first
    // toast in the store — grab each one's undo action as it's created,
    // before the next call overwrites it.
    act(() => {
      result.current.requestDelete(1, "First deleted");
    });
    const undoFirst = grabLatestToastUndo();

    act(() => {
      result.current.requestDelete(2, "Second deleted");
    });

    expect(result.current.isPendingDelete(1)).toBe(true);
    expect(result.current.isPendingDelete(2)).toBe(true);

    act(() => {
      undoFirst();
    });

    expect(result.current.isPendingDelete(1)).toBe(false);
    expect(result.current.isPendingDelete(2)).toBe(true);
  });
});
