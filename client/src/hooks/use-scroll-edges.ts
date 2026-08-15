import { useCallback, useEffect, useRef, useState } from "react";

// Tracks whether a horizontally-scrollable element has more content hidden
// past its left/right edge, so callers can render a fade/gradient hint.
// overflow-x-auto rows give no visual cue otherwise that there's more to
// scroll to — especially on mobile, where nothing resembles a scrollbar.
// `deps` lets a caller force a recheck when the row's content changes width
// without the row itself resizing (e.g. adding a step to a step strip).
export function useScrollEdges<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, ...deps]);

  return { ref, atStart, atEnd };
}
