import { useEffect, useRef, useState } from "react";

export interface InViewOptions {
  /** Stop observing after the first intersection. Default: false, so the
   *  caller can pause animations again once the element scrolls away. */
  once?: boolean;
  /** Visibility fraction that counts as "in view". Default 0.1. */
  threshold?: number;
  /** Grow the viewport so an animation starts just before entry. */
  rootMargin?: string;
}

/**
 * Whether an element is on screen. Long-running animations (chart draw-ins,
 * count-ups) key off this so they run while the user is actually looking at
 * them instead of playing to completion off screen in the background.
 * Falls back to `true` where IntersectionObserver is unavailable (SSR / jsdom).
 */
export function useInView<T extends Element>({
  once = false,
  threshold = 0.1,
  rootMargin = "0px",
}: InViewOptions = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  return { ref, inView };
}
