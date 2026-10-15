import { setSetting } from "@/lib/motion-settings";

/**
 * Sponsor-slot visibility. Always on — the Settings toggle was removed
 * so the sponsor tile can never be switched off. The stored key is inert.
 */

export const ADS_ENABLED_KEY = "mpesa-analyzer.ads-enabled";

/** Sponsor visibility defaults ON — Settings writes "0" to disable. */
export function getAdsEnabled(): boolean {
  try {
    return localStorage.getItem(ADS_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAdsEnabled(on: boolean): void {
  setSetting(ADS_ENABLED_KEY, on);
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useAdsEnabled(): boolean {
  return true;
}
