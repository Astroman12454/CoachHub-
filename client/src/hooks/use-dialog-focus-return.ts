import { useRef } from "react";

// Radix's own focus-restoration assumes a dialog stays mounted through its
// close animation. Ours don't fit that: the create/edit forms unmount
// entirely on close (conditionally rendered by the parent), and the
// confirm/attendance/recommendations dialogs stay mounted but get reused
// across many open/close cycles. Both skip Radix's built-in restore, so
// keyboard/screen-reader users lose their place — Escape (or Close) drops
// focus to <body> instead of back to the button that opened the dialog.
//
// The capture has to happen during render, not in an effect: Radix moves
// focus into the dialog via its own layout effect, and since that effect
// belongs to a child (the <Dialog>) it fires before any effect declared in
// this hook's caller. By the time a useEffect here would run, the trigger
// element is already gone from document.activeElement.
export function useDialogFocusReturn(open: boolean) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  if (open && !wasOpenRef.current) {
    triggerRef.current = document.activeElement as HTMLElement;
  }
  wasOpenRef.current = open;

  return () => {
    // Deferred to the next tick: at the moment this is called, Radix's
    // FocusScope is still trapping focus inside the (about to unmount)
    // dialog — an immediate .focus() call gets yanked right back inside
    // the trap. Waiting a tick lets the unmount/trap teardown finish first.
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };
}
