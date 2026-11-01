import { useEffect, useState } from "react";

/**
 * Whether the guided USSD service should answer the final "1 = Yes" prompt
 * after the user enters their PIN. Off by default: the user confirms every
 * payment themselves unless they explicitly opt in.
 */
export const AUTO_CONFIRM_KEY = "mpesa-analyzer.auto-confirm";
const AUTO_CONFIRM_EVENT = "mpesa-analyzer.auto-confirm-changed";

export function isAutoConfirmEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoConfirmEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_CONFIRM_KEY, on ? "1" : "0");
  } catch {
    /* private mode: session-only */
  }
  try {
    window.dispatchEvent(new Event(AUTO_CONFIRM_EVENT));
  } catch {
    /* non-DOM */
  }
}

/** Live setting state for Settings. */
export function useAutoConfirmEnabled(): boolean {
  const [value, setValue] = useState(isAutoConfirmEnabled);
  useEffect(() => {
    const refresh = () => setValue(isAutoConfirmEnabled());
    window.addEventListener(AUTO_CONFIRM_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AUTO_CONFIRM_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return value;
}
