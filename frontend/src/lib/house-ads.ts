import { useEffect, useState } from "react";
import { todayKey } from "@/lib/ads";

/**
 * House ads - sponsor cards curated by you, no ad SDK involved.
 *
 * To add a sponsor, append to docs/sponsors.json (published to main):
 *
 *   { "ads": [
 *     { "id": "acme-kenya",
 *       "title": "Acme",
 *       "text": "One line, 140 chars max.",
 *       "url": "https://acme.example" }
 *   ] }
 *
 * Rules enforced below: https-only URLs, length caps, unique ids, max 20
 * cards. The app fetches the file at most once per day, caches the last
 * good copy in localStorage (offline-safe), and rotates one card per day.
 * Empty list (or offline with nothing cached) renders the "Advertise here"
 * fallback instead - never a blank hole.
 */

export interface HouseAd {
  id: string;
  title: string;
  text: string;
  url: string;
}

export const SPONSORS_URL =
  "https://raw.githubusercontent.com/trononly/mpesa-analyzer/main/docs/sponsors.json";
export const ADVERTISE_URL =
  "https://github.com/trononly/mpesa-analyzer/issues";

const CACHE_KEY = "mpesa-analyzer.house-ads";
const HOUSE_ADS_EVENT = "mpesa-analyzer.house-ads";
const FETCH_TIMEOUT_MS = 5000;
const MAX_ADS = 20;

export function parseHouseAds(data: unknown): HouseAd[] {
  if (typeof data !== "object" || data === null) return [];
  const list = (data as { ads?: unknown }).ads;
  if (!Array.isArray(list)) return [];
  const out: HouseAd[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const { id, title, text, url } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 64) continue;
    if (typeof title !== "string" || !title || title.length > 60) continue;
    if (typeof text !== "string" || !text || text.length > 140) continue;
    if (
      typeof url !== "string" ||
      url.length > 200 ||
      !/^https:\/\/[^/]+\.[^/]+/.test(url)
    )
      continue;
    if (out.some((a) => a.id === id)) continue;
    out.push({ id, title, text, url });
  }
  return out.slice(0, MAX_ADS);
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic daily rotation - stable all day, no blank days. */
export function pickHouseAd(
  ads: HouseAd[],
  dateStr: string,
): HouseAd | null {
  if (ads.length === 0) return null;
  return ads[hashStr(dateStr) % ads.length];
}

function readCache(): { fetchedAt: string; ads: HouseAd[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { fetchedAt, ads } = parsed as { fetchedAt?: unknown; ads?: unknown };
    if (typeof fetchedAt !== "string") return null;
    return { fetchedAt, ads: parseHouseAds({ ads }) };
  } catch {
    return null;
  }
}

function notify(): void {
  try {
    window.dispatchEvent(new Event(HOUSE_ADS_EVENT));
  } catch {
    /* non-DOM: no-op */
  }
}

/** Fetch once per day; failures keep serving the cached copy. */
export async function refreshHouseAds(today = todayKey()): Promise<HouseAd[]> {
  const cached = readCache();
  if (cached && cached.fetchedAt === today) return cached.ads;
  let ads: HouseAd[] | null = null;
  try {
    const res = await fetch(SPONSORS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) ads = parseHouseAds(await res.json());
  } catch {
    ads = null;
  }
  const next = ads ?? cached?.ads ?? [];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: today, ads: next }));
  } catch {
    /* private mode: stays session-only */
  }
  notify();
  return next;
}

/** Cached sponsors immediately, background refresh on mount. */
export function useHouseAds(): HouseAd[] {
  const [ads, setAds] = useState<HouseAd[]>(() => readCache()?.ads ?? []);
  useEffect(() => {
    let live = true;
    void refreshHouseAds().then((next) => {
      if (live) setAds(next);
    });
    const onUpdate = () => setAds(readCache()?.ads ?? []);
    window.addEventListener(HOUSE_ADS_EVENT, onUpdate);
    return () => {
      live = false;
      window.removeEventListener(HOUSE_ADS_EVENT, onUpdate);
    };
  }, []);
  return ads;
}
