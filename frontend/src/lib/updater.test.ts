import { describe, expect, it } from "vitest";

import {
	compareVersions,
	isNewerVersion,
	normalizeVersion,
	pickApkAsset,
} from "@/lib/updater";

describe("normalizeVersion", () => {
	it("strips the tripwire- tag prefix", () => {
		expect(normalizeVersion("tripwire-1.2.3")).toBe("1.2.3");
	});

	it("strips a v prefix", () => {
		expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
	});

	it("leaves bare versions alone", () => {
		expect(normalizeVersion("1.2.3")).toBe("1.2.3");
	});
});

describe("compareVersions", () => {
	it("orders numerically, not lexicographically", () => {
		expect(compareVersions("1.2.3", "1.2.10")).toBeLessThan(0);
		expect(compareVersions("1.10.0", "1.2.0")).toBeGreaterThan(0);
		expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
	});

	it("treats missing segments as zero", () => {
		expect(compareVersions("1.2", "1.2.0")).toBe(0);
	});

	it("sorts suffixed builds below the bare release", () => {
		expect(compareVersions("1.2.3-debug", "1.2.3")).toBeLessThan(0);
		expect(compareVersions("1.2.3", "1.2.3-debug")).toBeGreaterThan(0);
	});
});

describe("isNewerVersion", () => {
	it("detects a newer tripwire tag", () => {
		expect(isNewerVersion("tripwire-1.2.3", "1.2.2")).toBe(true);
	});

	it("is false for the same or older versions", () => {
		expect(isNewerVersion("tripwire-1.2.3", "1.2.3")).toBe(false);
		expect(isNewerVersion("tripwire-1.2.3", "1.2.4")).toBe(false);
	});

	it("is false when either side is unknown", () => {
		expect(isNewerVersion("", "1.2.3")).toBe(false);
		expect(isNewerVersion("tripwire-1.2.4", "")).toBe(false);
	});
});

describe("pickApkAsset", () => {
	it("prefers the official Tripwire APK over other apks", () => {
		const assets = [
			{ name: "other.apk", browser_download_url: "u1", size: 1 },
			{ name: "Tripwire-1.2.3.apk", browser_download_url: "u2", size: 2 },
		];
		expect(pickApkAsset(assets)?.browser_download_url).toBe("u2");
	});

	it("skips debug-signed builds when a release build exists", () => {
		const assets = [
			{ name: "Tripwire-1.2.3-debug.apk", browser_download_url: "u1", size: 1 },
			{ name: "Tripwire-1.2.3.apk", browser_download_url: "u2", size: 2 },
		];
		expect(pickApkAsset(assets)?.browser_download_url).toBe("u2");
	});

	it("falls back to any apk when nothing official matches", () => {
		const assets = [
			{ name: "app-release.apk", browser_download_url: "u1", size: 1 },
		];
		expect(pickApkAsset(assets)?.browser_download_url).toBe("u1");
	});

	it("returns null when there is no apk", () => {
		expect(
			pickApkAsset([{ name: "Tripwire-1.2.3.aab", browser_download_url: "u", size: 1 }]),
		).toBeNull();
		expect(pickApkAsset([])).toBeNull();
	});
});
