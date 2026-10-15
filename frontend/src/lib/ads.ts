/**
 * Sponsor-slot visibility. Always on - the Settings toggle was removed
 * so the sponsor tile can never be switched off.
 */

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useAdsEnabled(): boolean {
  return true;
}
