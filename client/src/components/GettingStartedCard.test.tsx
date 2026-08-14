import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GettingStartedCard from "./GettingStartedCard";

// The dashboard fixture used by the e2e suite has accumulated real players,
// sessions, and recurring slots over time, so it can't exercise the
// "brand-new account" states reliably — this covers the component's actual
// contract directly with mock props instead.
describe("GettingStartedCard", () => {
  afterEach(cleanup);

  const baseProps = {
    hasPlayers: false,
    hasRecurringSchedule: false,
    hasSessions: false,
    onAddPlayers: vi.fn(),
    onSetSchedule: vi.fn(),
    onCreateSession: vi.fn(),
  };

  it("renders nothing once all three steps are done", () => {
    const { container } = render(
      <GettingStartedCard {...baseProps} hasPlayers hasRecurringSchedule hasSessions />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the pending steps and calls back when one is clicked", async () => {
    const user = userEvent.setup();
    const onAddPlayers = vi.fn();
    render(<GettingStartedCard {...baseProps} onAddPlayers={onAddPlayers} />);

    const addPlayersButton = screen.getByRole("button", { name: /add your players/i });
    expect(addPlayersButton).toBeEnabled();
    await user.click(addPlayersButton);
    expect(onAddPlayers).toHaveBeenCalledTimes(1);
  });

  it("disables and marks a step done once its data exists, without hiding the still-pending ones", () => {
    render(<GettingStartedCard {...baseProps} hasPlayers />);

    expect(screen.getByRole("button", { name: /add your players/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /set your weekly schedule/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /create your first training session/i })).toBeEnabled();
  });
});
