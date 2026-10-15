import { describe, expect, it } from "vitest";
import { parseHouseAds, pickHouseAd, type HouseAd } from "./house-ads";

const good = {
  id: "acme",
  title: "Acme",
  text: "One line of sponsor copy.",
  url: "https://acme.example/shop",
};

describe("house-ads", () => {
  it("accepts a well-formed list", () => {
    expect(parseHouseAds({ ads: [good] })).toEqual([good]);
  });

  it("rejects non-https, overlong, duplicate and malformed entries", () => {
    const ads = parseHouseAds({
      ads: [
        good,
        { ...good, id: "http", url: "http://acme.example" },
        { ...good, id: "js", url: "javascript:alert(1)" },
        { ...good, id: "long", title: "x".repeat(61) },
        { ...good, id: "copycat" },
        { ...good, id: "acme" },
        "nope",
        null,
      ],
    });
    expect(ads).toEqual([good, { ...good, id: "copycat" }]);
  });

  it("returns [] for missing or malformed payloads", () => {
    expect(parseHouseAds(null)).toEqual([]);
    expect(parseHouseAds({})).toEqual([]);
    expect(parseHouseAds({ ads: "nope" })).toEqual([]);
  });

  it("picks a stable card per day and null when empty", () => {
    const list: HouseAd[] = [
      good,
      { ...good, id: "b", title: "B" },
      { ...good, id: "c", title: "C" },
    ];
    expect(pickHouseAd(list, "2026-10-13")).toEqual(
      pickHouseAd(list, "2026-10-13"),
    );
    expect(pickHouseAd([], "2026-10-13")).toBeNull();
  });
});
