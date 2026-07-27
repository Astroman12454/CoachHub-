import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDialogFocusReturn } from "./use-dialog-focus-return";

describe("useDialogFocusReturn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores focus to whatever was focused when the dialog opened", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { result } = renderHook(({ open }) => useDialogFocusReturn(open), {
      initialProps: { open: true },
    });

    // Simulate focus moving into the dialog while it's open.
    const inDialog = document.createElement("input");
    document.body.appendChild(inDialog);
    inDialog.focus();
    expect(document.activeElement).toBe(inDialog);

    result.current();
    // Deferred a tick on purpose — see the hook's comment: Radix's focus
    // trap is still active synchronously, so an immediate .focus() would
    // just get pulled back inside it.
    expect(document.activeElement).toBe(inDialog);
    vi.runAllTimers();
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
    document.body.removeChild(inDialog);
  });

  it("re-captures the trigger each time the dialog re-opens", () => {
    const firstTrigger = document.createElement("button");
    const secondTrigger = document.createElement("button");
    document.body.append(firstTrigger, secondTrigger);

    firstTrigger.focus();
    const { result, rerender } = renderHook(({ open }) => useDialogFocusReturn(open), {
      initialProps: { open: true },
    });
    rerender({ open: false });

    secondTrigger.focus();
    rerender({ open: true });
    rerender({ open: false });

    result.current();
    vi.runAllTimers();
    expect(document.activeElement).toBe(secondTrigger);

    document.body.removeChild(firstTrigger);
    document.body.removeChild(secondTrigger);
  });

  it("does nothing if the dialog never opened", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { result } = renderHook(({ open }) => useDialogFocusReturn(open), {
      initialProps: { open: false },
    });

    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();

    result.current();
    vi.runAllTimers();
    // Nothing was ever captured, so focus should stay put rather than jump.
    expect(document.activeElement).toBe(other);

    document.body.removeChild(trigger);
    document.body.removeChild(other);
  });
});
