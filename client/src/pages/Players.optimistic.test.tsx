import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import Players from "./Players";
import { SidebarProvider } from "@/hooks/use-sidebar";
import type { Player } from "@shared/schema";

// Covers the "mutaciones optimistas" leg of Fase 1: updatePlayerMutation's
// onMutate/onError/onSettled pattern in Players.tsx isn't extracted into a
// shared hook (unlike useSaveMutation/useDeleteWithUndo), so it's verified
// here at the page level instead of in isolation.

function renderPlayers(players: Player[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

    expect(await screen.findByText("Activo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    // Optimistic: flips immediately, before the mocked PUT has resolved.
    expect(await screen.findByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();

    resolvePut(new Response(JSON.stringify({ ...player, isActive: 0 }), { status: 200 }));

    // Stays flipped once the real response (and the onSettled refetch) lands.
    await waitFor(() => expect(screen.getByText("Inactivo")).toBeInTheDocument());
  });

  it("rolls back to the original state if the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return Promise.resolve(new Response("Server error", { status: 500 }));
        }
        return Promise.resolve(new Response(JSON.stringify([player]), { status: 200 }));
      }),
    );

    renderPlayers([player]);
    const user = userEvent.setup();

    expect(await screen.findByText("Activo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    // Optimistic flip happens first...
    expect(await screen.findByText("Inactivo")).toBeInTheDocument();

    // ...then rolls back once the failed request settles.
    await waitFor(() => expect(screen.getByText("Activo")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
  });
});
