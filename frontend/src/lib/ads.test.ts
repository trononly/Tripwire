import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdsEnabled, setAdsEnabled, todayKey } from "./ads";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
});

beforeEach(() => {
  store.clear();
});

describe("ads", () => {
  it("defaults ON until the user opts out", () => {
    expect(getAdsEnabled()).toBe(true);
    setAdsEnabled(false);
    expect(getAdsEnabled()).toBe(false);
    setAdsEnabled(true);
    expect(getAdsEnabled()).toBe(true);
  });

  it("builds a local YYYY-MM-DD day key", () => {
    expect(todayKey(new Date(2026, 9, 14))).toBe("2026-10-14");
  });
});
