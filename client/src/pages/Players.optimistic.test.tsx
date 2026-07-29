import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import Players from "./Players";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { getQueryFn } from "@/lib/queryClient";
import type { Player } from "@shared/schema";

// Covers the "mutaciones optimistas" leg of Fase 1: updatePlayerMutation's
// onMutate/onError/onSettled pattern in Players.tsx isn't extracted into a
// shared hook (unlike useSaveMutation/useDeleteWithUndo), so it's verified
// here at the page level instead of in isolation.

function renderPlayers(players: Player[]) {
  const queryClient = new QueryClient({
    // Mirrors the app's real QueryClient defaults — staleTime: Infinity so
    // the pre-seeded data below is treated as fresh on mount, and the real
    // getQueryFn so the onSettled-triggered invalidateQueries refetch (after
    // the PUT resolves) has something to actually call instead of erroring.
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(["/api/players"], players);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>{children}</SidebarProvider>
    </QueryClientProvider>
  );

  return { queryClient, ...render(<Players />, { wrapper }) };
}

const player: Player = { id: 1, name: "Luis Hernández", position: "Small Forward", isActive: 1 };

describe("Players — optimistic active/inactive toggle", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it("flips the badge before the server responds, and keeps it after the request resolves", async () => {
    let resolvePut!: (res: Response) => void;
    const putPromise = new Promise<Response>((resolve) => {
      resolvePut = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") return putPromise;
        return Promise.resolve(new Response(JSON.stringify([player]), { status: 200 }));
      }),
    );

    renderPlayers([player]);
    const user = userEvent.setup();

    expect(await screen.findByText("Active")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    // Optimistic: flips immediately, before the mocked PUT has resolved.
    expect(await screen.findByText("Inactive")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();

    resolvePut(new Response(JSON.stringify({ ...player, isActive: 0 }), { status: 200 }));

    // Stays flipped once the real response (and the onSettled refetch) lands.
    await waitFor(() => expect(screen.getByText("Inactive")).toBeInTheDocument());
  });

  it("rolls back to the original state if the request fails", async () => {
    // The PUT promise is held open (like the "flips the badge" test above)
    // rather than resolved instantly — otherwise the mocked request can
    // reject and roll back before React ever commits the optimistic render,
    // making the assertion below race the mock instead of testing the app.
    let rejectPut!: () => void;
    const putPromise = new Promise<Response>((_resolve, reject) => {
      rejectPut = () => reject(new Error("500: Server error"));
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") return putPromise;
        return Promise.resolve(new Response(JSON.stringify([player]), { status: 200 }));
      }),
    );

    renderPlayers([player]);
    const user = userEvent.setup();

    expect(await screen.findByText("Active")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    // Optimistic flip happens first, before the mocked PUT has resolved.
    expect(await screen.findByText("Inactive")).toBeInTheDocument();

    rejectPut();

    // ...then rolls back once the failed request settles.
    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });
});
