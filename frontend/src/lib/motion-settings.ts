import { useEffect, useState } from "react";

export const REDUCE_MOTION_KEY = "mpesa-analyzer.reduce-motion";
export const HAPTICS_KEY = "mpesa-analyzer.haptics";

export function prefersReducedMotionOS(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** App setting wins when explicitly set; otherwise fall back to the OS. */
export function shouldReduceMotion(): boolean {
  try {
    const v = localStorage.getItem(REDUCE_MOTION_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* private mode: fall through to OS */
  }
  return prefersReducedMotionOS();
}

/** Haptics default to on; the Settings toggle writes "0" to disable. */
export function getHapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function vibrateIfEnabled(pattern: number | number[]): void {
  if (!getHapticsEnabled()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* desktop / no haptics: silent no-op */
  }
}

const SETTINGS_EVENT = "mpesa-analyzer.settings-changed";

export function setSetting(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode: stays session-only */
  }
  try {
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  } catch {
    /* non-DOM: no-op */
  }
}

function useSetting(getter: () => boolean): boolean {
  const [value, setValue] = useState(getter);
  useEffect(() => {
    const refresh = () => setValue(getter());
    window.addEventListener(SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return value;
}

export function useReduceMotionEnabled(): boolean {
  return useSetting(shouldReduceMotion);
}

export function useHapticsEnabled(): boolean {
  return useSetting(getHapticsEnabled);
}
