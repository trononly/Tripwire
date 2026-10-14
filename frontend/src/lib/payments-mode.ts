import { useEffect, useState } from "react";
import { setSetting } from "@/lib/motion-settings";

/**
 * Payments visibility. ON by default; Settings flips it off. Nothing
 * is ever locked — the toggle only shows or hides the M-Pesa speed-dial
 * (FAB) and its Send / Lipa / Withdraw destinations.
 */

export const PAYMENTS_ENABLED_KEY = "tripwire.payments-enabled";
const SETTINGS_EVENT = "mpesa-analyzer.settings-changed";

/** Payments default ON — Settings writes "0" to disable. */
export function getPaymentsEnabled(): boolean {
  try {
    return localStorage.getItem(PAYMENTS_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setPaymentsEnabled(on: boolean): void {
  setSetting(PAYMENTS_ENABLED_KEY, on);
}

export function usePaymentsEnabled(): boolean {
  const [value, setValue] = useState(getPaymentsEnabled);
  useEffect(() => {
    const refresh = () => setValue(getPaymentsEnabled());
    window.addEventListener(SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return value;
}
