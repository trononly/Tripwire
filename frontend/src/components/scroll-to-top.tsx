import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// One saved offset per history entry, keyed by location.key. A module map is
// enough: positions only matter for the life of the tab, and it avoids a
// storage write on every scroll frame.
const positions = new Map<string, number>();

/**
 * New destinations start at the top, while back and forward return the user
 * to the offset they left. Browsers do that for multi-page sites themselves;
 * a hash-routed single-page app has to do it by hand.
 *
 * Lazy pages and their async data mount after the route changes, so a restore
 * retries for a few frames until the document is tall enough to reach the
 * saved offset instead of clamping to a shorter page.
 */
export function ScrollToTop() {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const restoring = useRef(false);

  // Remember this entry's offset while the user reads it.
  useEffect(() => {
    const save = () => {
      if (!restoring.current) positions.set(key, window.scrollY);
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      // This cleanup runs while the page being left is still laid out, so
      // window.scrollY is the offset that belongs to that entry.
      if (!restoring.current) positions.set(key, window.scrollY);
    };
  }, [key]);

  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo(0, 0);
      return;
    }
    const target = positions.get(key) ?? 0;
    if (target <= 0) {
      window.scrollTo(0, 0);
      return;
    }

    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    restoring.current = true;
    const step = () => {
      if (cancelled) return;
      window.scrollTo(0, target);
      attempts += 1;
      if (window.scrollY >= target - 1 || attempts > 45) {
        restoring.current = false;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      restoring.current = false;
      cancelAnimationFrame(frame);
    };
  }, [key, navigationType]);

  return null;
}
