import { useEffect, useRef, useState } from "react";
import { useReduceMotionEnabled } from "@/lib/motion-settings";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animate a numeric value toward `target` with requestAnimationFrame.
 * Starts from the previous value (0 on mount). Returns target immediately
 * when the user prefers reduced motion (app setting or OS) or when
 * rendering on the server. Pass `active = false` to hold the value until the
 * figure scrolls into view (see useInView), so the count-up plays for the
 * user instead of running off screen.
 */
export function useCountUp(
  target: number,
  durationMs = 800,
  active = true,
): number {
  const reduced = useReduceMotionEnabled();
  const [value, setValue] = useState(() => (reduced ? target : 0));
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    // Off screen: hold at the start so the animation can play on entry.
    if (!active) return;
    const from = fromRef.current;
    if (from === target) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = from + (target - from) * easeOutCubic(t);
      if (t >= 1) {
        fromRef.current = target;
        setValue(target);
        rafRef.current = null;
        return;
      }
      setValue(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      fromRef.current = target;
    };
  }, [target, durationMs, reduced, active]);

  return value;
}
