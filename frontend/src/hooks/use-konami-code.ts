import { useCallback, useEffect, useRef, useState } from "react";

const DEBUG_KEY = "mpesa-analyzer.debug";

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* desktop / no haptics: silent no-op */
  }
}

// Up Up Down Down Left Right Left Right B A. Letters match either case.
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/**
 * Hidden debug unlock for Settings. Desktop: type the Konami code.
 * Touch: tap the Settings title seven times within three seconds (phones
 * have no keyboards). Unlock persists in localStorage.
 */
export function useKonamiCode() {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  });
  const progress = useRef(0);
  const taps = useRef<number[]>([]);

  const unlock = useCallback(() => {
    setUnlocked(true);
    vibrate([20, 30, 20]);
    try {
      localStorage.setItem(DEBUG_KEY, "1");
    } catch {
      /* private mode: debug stays session-only */
    }
  }, []);

  const lock = useCallback(() => {
    setUnlocked(false);
    vibrate([30, 20]);
    try {
      localStorage.removeItem(DEBUG_KEY);
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    if (unlocked) return;
    const onKey = (e: KeyboardEvent) => {
      const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (got === KONAMI[progress.current]) {
        progress.current += 1;
        if (progress.current === KONAMI.length) unlock();
      } else {
        progress.current = got === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlocked, unlock]);

  const tap = useCallback(() => {
    vibrate(15);
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 7) {
      taps.current = [];
      if (unlocked) lock();
      else unlock();
    }
  }, [unlock, lock, unlocked]);

  return { unlocked, tap, lock };
}
