import { useRef } from "react";

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum horizontal travel, in px, before a touch counts as a swipe
   * rather than a tap or a vertical scroll. */
  threshold?: number;
}

// Touch-only (mouse/trackpad users have the prev/next buttons already) —
// tracks a single finger's start/end position and fires once the gesture
// completes, rejecting anything more vertical than horizontal so a normal
// scroll never gets mistaken for a swipe.
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 60 }: UseSwipeOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  };

  return { onTouchStart, onTouchEnd };
}
