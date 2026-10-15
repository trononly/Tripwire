import { describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({ Browser: { OpenURL: vi.fn() } }));

import { Browser } from "@wailsio/runtime";
import { SODA_URL, openExternalUrl } from "./external-url";

describe("external-url", () => {
  it("points the tip jar at buymesoda", () => {
    expect(SODA_URL).toBe(
      "https://buymesoda.com/cZxN2bSMZddvzVDzv4EXEgCdogo2",
    );
  });

  it("opens the soda link without touching the app WebView", () => {
    openExternalUrl(SODA_URL);
    expect(Browser.OpenURL).toHaveBeenCalledWith(SODA_URL);
  });
});
