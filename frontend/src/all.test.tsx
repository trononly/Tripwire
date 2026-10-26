// The single home for every frontend test. One file on purpose: the suite
// is small (pure lib functions plus one component render), and a single
// file keeps the whole contract visible without hunting across folders.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { Browser } from "@wailsio/runtime";
import { TransactionList, formatAmount } from "@/components/transaction-list";
import type { Group } from "@/components/transaction-list";
import { typeStyle } from "@/lib/transaction-types";
import {
	resolveCategoryIcon,
	searchCategoryIcons,
} from "@/components/category-icon";
import { filterGroups, filterByCustomCategory } from "@/lib/transaction-filter";
import { ReleaseNotes } from "@/components/release-notes";
import { parseInline, parseReleaseNotes } from "@/lib/release-notes";
import {
  counterpartyDisplayName,
  CounterpartyCard,
} from "@/components/counterparty-card";
import type * as models from "../bindings/mpesa-analyzer/models";
import type * as analysis from "../bindings/mpesa-analyzer/internal/analysis/models";
import { todayKey } from "@/lib/ads";
import { SODA_URL, openExternalUrl } from "@/lib/external-url";
import { parseHouseAds, pickHouseAd, type HouseAd } from "@/lib/house-ads";
import {
	compareVersions,
	isNewerVersion,
	normalizeVersion,
	pickApkAsset,
	releaseTag,
	selectReleaseHistory,
	type GithubReleaseApi,
} from "@/lib/updater";
import {
	CHANGELOG_CACHE_KEY,
	cacheChangelog,
	cachedChangelogFor,
	readChangelogCache,
	writeChangelogCache,
	type ChangelogCache,
} from "@/lib/changelog";
import {
	buildPaybillScript,
	buildSendScript,
	buildTillScript,
	normalizePhone,
} from "@/lib/ussd-menus";
import { paySimKey } from "@/lib/pay-sim";
import type { RecurringPayment } from "../bindings/mpesa-analyzer/internal/recurring/models";
import type { Transaction } from "../bindings/mpesa-analyzer/internal/parser/models";
import {
	amountBands,
	emptyPlan,
	planCoversDetected,
	planFromDetected,
	lastPaidOf,
	nextDue,
	planScript,
	samePlanTarget,
	type PlanLike,
} from "@/lib/recurring-plans";
import {
	favouriteInitials,
	formatFavouritePhone,
	isActiveFavourite,
	moveItem,
	type Favourite,
} from "@/lib/favourites";
import {
	isActiveLipaFavourite,
	lipaFavouriteDetail,
	type LipaFavourite,
} from "@/lib/lipa-favourites";
import { formatAmountInput, formatBytes, formatPhoneInput } from "@/lib/format";
import { applySafeArea, parseSafeArea } from "@/lib/safe-area";
import { useModalBack } from "@/hooks/use-modal-back";
import FavouritesRow from "@/components/favourites-row";
import { FavouritesList } from "@/components/favourites-list";
import { UpdateDialog } from "@/components/update-dialog";
import type { Updater } from "@/hooks/use-updater";
import {
	PRIVACY_MODE_KEY,
	getPrivacyModeEnabled,
	setPrivacyMode,
	togglePrivacyMode,
} from "@/lib/privacy-mode";
import { dayEndMs, dayStartMs, filterSmsResults } from "@/lib/sms-filter";

// Keep every other import of the Wails runtime intact; only the browser
// opener is a spy so external-url stays testable off-device.
vi.mock("@wailsio/runtime", async (importOriginal) => ({
	...(await importOriginal<typeof import("@wailsio/runtime")>()),
	Browser: { OpenURL: vi.fn() },
}));

// --- ads ---

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
	it("builds a local YYYY-MM-DD day key", () => {
		expect(todayKey(new Date(2026, 9, 14))).toBe("2026-10-14");
	});
});

// --- external-url ---

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

// --- house-ads ---

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

// --- updater ---

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

describe("releaseTag", () => {
	it("maps a version to its tripwire- release tag", () => {
		expect(releaseTag("1.2.3")).toBe("tripwire-1.2.3");
		expect(releaseTag("tripwire-1.2.3")).toBe("tripwire-1.2.3");
		expect(releaseTag("v1.2.3")).toBe("tripwire-1.2.3");
	});

	it("returns empty for an unknown version", () => {
		expect(releaseTag("")).toBe("");
	});
});

describe("selectReleaseHistory", () => {
	const api = (
		tag: string,
		extra: Partial<GithubReleaseApi> = {},
	): GithubReleaseApi => ({
		tag_name: tag,
		name: tag,
		body: `notes for ${tag}`,
		html_url: `https://example.test/${tag}`,
		assets: [],
		...extra,
	});

	const releases = [
		api("tripwire-1.0.0"),
		api("tripwire-1.2.0"),
		api("tripwire-1.1.0"),
		api("tripwire-1.3.0"),
		api("v1.5.0"),
		api("tripwire-1.4.0", { prerelease: true }),
		api("tripwire-2.0.0", { draft: true }),
	];

	it("returns every skipped release, oldest first", () => {
		expect(
			selectReleaseHistory(releases, "1.0.0", "1.3.0").map((r) => r.version),
		).toEqual(["1.1.0", "1.2.0", "1.3.0"]);
	});

	it("keeps a one-release jump to a single entry", () => {
		expect(
			selectReleaseHistory(releases, "1.2.0", "1.3.0").map((r) => r.version),
		).toEqual(["1.3.0"]);
	});

	it("ignores non-tripwire tags, drafts and pre-releases", () => {
		expect(
			selectReleaseHistory(releases, "1.3.0", "1.4.0").map((r) => r.version),
		).toEqual([]);
	});

	it("returns nothing when either version is unknown", () => {
		expect(selectReleaseHistory(releases, "", "1.3.0")).toEqual([]);
		expect(selectReleaseHistory(releases, "1.0.0", "")).toEqual([]);
	});
});

// --- input formatting ---

describe("input formatting", () => {
	it("groups whole-shilling amounts from the right", () => {
		expect(formatAmountInput("")).toBe("");
		expect(formatAmountInput("500")).toBe("500");
		expect(formatAmountInput("1234567")).toBe("1,234,567");
		expect(formatAmountInput("12,34a56")).toBe("123,456");
	});

	it("splits a Kenyan mobile number into readable groups", () => {
		expect(formatPhoneInput("0712")).toBe("0712");
		expect(formatPhoneInput("07123")).toBe("0712 3");
		expect(formatPhoneInput("0712345678")).toBe("0712 345 678");
		expect(formatPhoneInput("+254 712 345 678")).toBe("0712 345 678");
		expect(formatPhoneInput("071234567899")).toBe("0712 345 678");
	});
});


// --- changelog cache ---

describe("changelog cache", () => {
	const notes = {
		version: "1.2.3",
		title: "Tripwire 1.2.3",
		notes: "## What's Changed\n* stuff",
		htmlUrl: "https://github.com/trononly/Tripwire/releases/tag/tripwire-1.2.3",
	};

	it("round-trips notes through the cache", () => {
		expect(readChangelogCache()).toEqual({});
		cacheChangelog(notes);
		const entry = readChangelogCache()["1.2.3"];
		expect(entry).toMatchObject(notes);
		expect(typeof entry.fetchedAt).toBe("number");
		expect(store.get(CHANGELOG_CACHE_KEY)).toBeTruthy();
	});

	it("keeps one entry per version, tolerant of a v prefix", () => {
		cacheChangelog(notes);
		cacheChangelog({ ...notes, version: "2.0.0", notes: "next" });
		expect(cachedChangelogFor("1.2.3")).toMatchObject({ notes: notes.notes });
		expect(cachedChangelogFor("v1.2.3")).toMatchObject({ notes: notes.notes });
		expect(cachedChangelogFor("2.0.0")).toMatchObject({ notes: "next" });
	});

	it("returns null for versions that are not cached", () => {
		cacheChangelog(notes);
		expect(cachedChangelogFor("9.9.9")).toBeNull();
		expect(cachedChangelogFor("")).toBeNull();
	});

	it("evicts the oldest entries past the cap", () => {
		const seeded: ChangelogCache = {};
		for (let i = 0; i < 5; i++) {
			seeded[`1.0.${i}`] = { ...notes, version: `1.0.${i}`, fetchedAt: i + 1 };
		}
		writeChangelogCache(seeded);
		cacheChangelog({ ...notes, version: "2.0.0" });
		const cache = readChangelogCache();
		expect(Object.keys(cache).length).toBe(5);
		expect(cache["1.0.0"]).toBeUndefined();
		expect(cache["2.0.0"]).toBeDefined();
	});

	it("rejects malformed or empty cache payloads", () => {
		store.set(CHANGELOG_CACHE_KEY, "{not json");
		expect(readChangelogCache()).toEqual({});
		store.set(CHANGELOG_CACHE_KEY, JSON.stringify({ "1.2.3": { version: "", notes: "x" } }));
		expect(readChangelogCache()).toEqual({});
		store.set(CHANGELOG_CACHE_KEY, JSON.stringify({ "1.2.3": { version: "1.2.3" } }));
		expect(readChangelogCache()).toEqual({});
	});
});

// --- release notes ---

const RELEASE_BODY = `## What's Changed
* Add **dark mode** by @alice in https://github.com/trononly/Tripwire/pull/12
* Fix a \`nil\` panic by @bob in https://github.com/trononly/Tripwire/pull/13
<!-- contributor hint -->

## New Contributors
* @alice made their first contribution in https://github.com/trononly/Tripwire/pull/12

**Full Changelog**: https://github.com/trononly/Tripwire/compare/tripwire-1.0.0...tripwire-1.1.0`;

describe("release notes markdown", () => {
	it("parses headings, bullets and the changelog footer into blocks", () => {
		const blocks = parseReleaseNotes(RELEASE_BODY);
		expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
		expect(blocks[1]).toMatchObject({ kind: "list", ordered: false });
		const list = blocks.find((b) => b.kind === "list");
		expect(list && list.kind === "list" ? list.items.length : 0).toBe(2);
		// The footer is a paragraph mixing bold and a link.
		const footer = blocks[blocks.length - 1];
		expect(footer.kind).toBe("paragraph");
		if (footer.kind === "paragraph") {
			expect(footer.content[0]).toEqual({ kind: "bold", value: "Full Changelog" });
			expect(footer.content.at(-1)).toMatchObject({ kind: "link" });
		}
	});

	it("links bare URLs and keeps inline code literal", () => {
		const items = parseReleaseNotes(RELEASE_BODY).find(
			(b) => b.kind === "list",
		);
		if (items?.kind !== "list") throw new Error("expected a list");
		expect(items.items[0]).toEqual([
			{ kind: "text", value: "Add " },
			{ kind: "bold", value: "dark mode" },
			{ kind: "text", value: " by @alice in " },
			{
				kind: "link",
				text: "https://github.com/trononly/Tripwire/pull/12",
				href: "https://github.com/trononly/Tripwire/pull/12",
			},
		]);
		expect(items.items[1][1]).toEqual({ kind: "code", value: "nil" });
	});

	it("drops HTML comments and supports ordered lists", () => {
		expect(parseReleaseNotes("text\n<!-- hidden -->")).toEqual([
			{ kind: "paragraph", content: [{ kind: "text", value: "text" }] },
		]);
		expect(parseReleaseNotes("1. one\n2. two")[0]).toMatchObject({
			kind: "list",
			ordered: true,
		});
	});

	it("parses [label](url) links and leaves underscores literal", () => {
		expect(parseInline("[docs](https://x.example) send_money")).toEqual([
			{ kind: "link", text: "docs", href: "https://x.example" },
			{ kind: "text", value: " send_money" },
		]);
	});

	it("renders styled notes rather than raw markdown", () => {
		render(<ReleaseNotes notes={RELEASE_BODY} />);
		expect(screen.getByText("What's Changed")).toBeInTheDocument();
		const links = screen.getAllByRole("link", {
			name: "https://github.com/trononly/Tripwire/pull/12",
		});
		expect(links[0]).toHaveAttribute(
			"href",
			"https://github.com/trononly/Tripwire/pull/12",
		);
		// Markers must not leak into the visible text.
		expect(screen.queryByText(/##/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
	});

	it("opens note links in the system browser", () => {
		render(<ReleaseNotes notes={RELEASE_BODY} />);
		fireEvent.click(
			screen.getByRole("link", {
				name: "https://github.com/trononly/Tripwire/pull/13",
			}),
		);
		expect(Browser.OpenURL).toHaveBeenCalledWith(
			"https://github.com/trononly/Tripwire/pull/13",
		);
	});
});

// --- ussd-menus ---
describe("ussd-menus", () => {
	it("builds a send script ending in PIN-stop + confirm", () => {
		const s = buildSendScript("send", "0722123456", "500");
		expect(s?.kind).toBe("send");
		expect(s?.version).toBe(1);
		expect(s?.steps.map((st) => st.input)).toEqual([
			"1",
			"1",
			"0722123456",
			"500",
			"1",
		]);
	});

	it("builds a pochi script selecting option 3", () => {
		const s = buildSendScript("pochi", "0722123456", "500");
		expect(s?.kind).toBe("pochi");
		expect(s?.steps[1]).toMatchObject({ input: "3" });
	});

	it("normalizes 254-prefixed numbers", () => {
		expect(normalizePhone("254722123456")).toBe("0722123456");
		expect(normalizePhone("+254722123456")).toBe("0722123456");
		expect(normalizePhone("12345")).toBe("");
	});

	it("normalizes the formats contacts and manual entry produce", () => {
		expect(normalizePhone("00254 722 123 456")).toBe("0722123456");
		expect(normalizePhone("254 (0) 722 123 456")).toBe("0722123456");
		expect(normalizePhone("722 123 456")).toBe("0722123456");
		expect(normalizePhone("0712-345-678")).toBe("0712345678");
		expect(normalizePhone("0112 345 678")).toBe("0112345678");
		expect(normalizePhone("020 123 4567")).toBe("");
	});

	it("rejects invalid send input", () => {
		expect(buildSendScript("send", "12345", "500")).toBeNull();
		expect(buildSendScript("send", "0722123456", "0")).toBeNull();
		expect(buildSendScript("send", "0722123456", "5000001")).toBeNull();
	});

	it("builds paybill and till scripts", () => {
		const p = buildPaybillScript("123456", "rent", "1000");
		expect(p?.steps.map((st) => st.input)).toEqual([
			"6",
			"1",
			"123456",
			"rent",
			"1000",
			"1",
		]);
		const t = buildTillScript("543210", "250");
		expect(t?.steps.map((st) => st.input)).toEqual([
			"6",
			"2",
			"543210",
			"250",
			"1",
		]);
		expect(buildPaybillScript("12", "rent", "1000")).toBeNull();
		expect(buildTillScript("12", "250")).toBeNull();
	});

	it("rejects USSD control chars in account names", () => {
		expect(buildPaybillScript("123456", "a*b#c", "100")).toBeNull();
	});
});

// --- pay-sim ---
describe("pay-sim", () => {
	it("pins any SMS wallet's SIM, whatever the carrier label", () => {
		expect(
			paySimKey({ source: "sms", simId: "sim-0", simLabel: "Safaricom" }),
		).toBe("sim-0");
		expect(
			paySimKey({ source: "sms", simId: "sim-1", simLabel: "Safaricom" }),
		).toBe("sim-1");
		expect(
			paySimKey({ source: "sms", simId: "sim-1", simLabel: "Airtel" }),
		).toBe("sim-1");
		expect(
			paySimKey({ source: "sms", simId: "sub-12", simLabel: "Telkom" }),
		).toBe("sub-12");
	});

	it("trusts a wallet with no carrier label", () => {
		expect(paySimKey({ source: "sms", simId: "sim-0", simLabel: "" })).toBe(
			"sim-0",
		);
		expect(paySimKey({ source: "sms", simId: "sim-1", simLabel: "SIM 2" })).toBe(
			"sim-1",
		);
	});

	it("leaves statements and key-less records unpinned", () => {
		expect(paySimKey(null)).toBeNull();
		expect(
			paySimKey({ source: "statements", simId: "sim-0", simLabel: "Safaricom" }),
		).toBeNull();
		expect(paySimKey({ source: "sms", simId: " " })).toBeNull();
	});
});

// --- favourites ---

function favourite(overrides: Partial<Favourite>): Favourite {
	return {
		id: "f1",
		name: "Mama Jane",
		phone: "0712345678",
		kind: "send",
		sortOrder: 0,
		createdAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("favourite helpers", () => {
	it("formats canonical numbers and leaves anything else alone", () => {
		expect(formatFavouritePhone("0712345678")).toBe("0712 345 678");
		expect(formatFavouritePhone("254712345678")).toBe("254712345678");
	});

	it("builds initials from name words or the phone tail", () => {
		expect(favouriteInitials("Mama Jane")).toBe("MJ");
		expect(favouriteInitials("  alice  ")).toBe("A");
		expect(favouriteInitials("0712345678")).toBe("78");
		expect(favouriteInitials("")).toBe("#");
	});

	it("marks the active favourite across number formats", () => {
		expect(isActiveFavourite(favourite({}), "+254 712 345 678")).toBe(true);
		expect(isActiveFavourite(favourite({}), "")).toBe(false);
		expect(
			isActiveFavourite(favourite({ phone: "0722000001" }), "0712345678"),
		).toBe(false);
	});

	it("moves an item to a new position without mutating the list", () => {
		const items = ["a", "b", "c"];
		expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a"]);
		expect(moveItem(items, 2, 0)).toEqual(["c", "a", "b"]);
		expect(moveItem(items, 1, 1)).toBe(items);
		expect(moveItem(items, 0, 3)).toBe(items);
		expect(items).toEqual(["a", "b", "c"]);
	});
});

function lipaFavourite(overrides: Partial<LipaFavourite>): LipaFavourite {
	return {
		id: "l1",
		name: "KPLC",
		kind: "paybill",
		number: "888880",
		account: "12345678",
		sortOrder: 0,
		createdAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("Lipa favourite helpers", () => {
	it("labels the kind and shows the account only for a paybill", () => {
		expect(lipaFavouriteDetail(lipaFavourite({}))).toBe(
			"Paybill 888880 · 12345678",
		);
		expect(
			lipaFavouriteDetail(
				lipaFavourite({ kind: "till", name: "Java", number: "543210", account: "" }),
			),
		).toBe("Till 543210");
	});

	it("matches the form by kind, number and paybill account", () => {
		const saved = lipaFavourite({});
		expect(isActiveLipaFavourite(saved, "paybill", "888 880", "12345678")).toBe(
			true,
		);
		expect(isActiveLipaFavourite(saved, "paybill", "888880", "99999999")).toBe(
			false,
		);
		expect(isActiveLipaFavourite(saved, "till", "888880", "")).toBe(false);
	});
});

describe("FavouritesRow", () => {
	it("prompts to save regulars when empty and opens management", () => {
		const onManage = vi.fn();
		render(<FavouritesRow items={[]} onManage={onManage} />);
		fireEvent.click(
			screen.getByRole("button", { name: /save your regulars/i }),
		);
		expect(onManage).toHaveBeenCalledOnce();
	});

	it("fills the phone from a chip without sending", () => {
		const onPick = vi.fn();
		render(
			<FavouritesRow
				items={[
					{
						id: "f1",
						name: "Mama Jane",
						active: true,
						onPick,
					},
				]}
				onManage={vi.fn()}
			/>,
		);
		const chip = screen.getByRole("button", { name: /mama jane/i });
		expect(chip).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(chip);
		expect(onPick).toHaveBeenCalledOnce();
	});
});

describe("FavouritesList", () => {
	it("reorders with the keyboard drag handle and persists the full id order", async () => {
		const onReorder = vi.fn().mockResolvedValue(true);
		render(
			<FavouritesList
				items={[
					{ id: "a", name: "Alice" },
					{ id: "b", name: "Bob" },
				]}
				onRename={vi.fn()}
				onRemove={vi.fn()}
				onReorder={onReorder}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /^reorder$/i }));
		fireEvent.keyDown(
			screen.getByRole("button", { name: /reorder alice/i }),
			{ key: "ArrowDown" },
		);
		await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["b", "a"]));
	});

	it("reorders by dragging the grip", async () => {
		const onReorder = vi.fn().mockResolvedValue(true);
		render(
			<FavouritesList
				items={[
					{ id: "a", name: "Alice" },
					{ id: "b", name: "Bob" },
				]}
				onRename={vi.fn()}
				onRemove={vi.fn()}
				onReorder={onReorder}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /^reorder$/i }));

		screen.getAllByRole("listitem").forEach((row, index) => {
			vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
				top: index * 48,
				bottom: (index + 1) * 48,
				height: 48,
				left: 0,
				right: 320,
				width: 320,
				x: 0,
				y: index * 48,
				toJSON: () => ({}),
			} as DOMRect);
		});

		const grip = screen.getByRole("button", { name: /reorder alice/i });
		fireEvent.pointerDown(grip, { pointerId: 7, button: 0, clientY: 24 });
		fireEvent.pointerMove(grip, { pointerId: 7, clientY: 72 });
		fireEvent.pointerUp(grip, { pointerId: 7, clientY: 72 });

		await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["b", "a"]));
	});

	it("does not persist an order the backend rejects", async () => {
		const onReorder = vi.fn().mockResolvedValue(false);
		render(
			<FavouritesList
				items={[
					{ id: "a", name: "Alice" },
					{ id: "b", name: "Bob" },
				]}
				onRename={vi.fn()}
				onRemove={vi.fn()}
				onReorder={onReorder}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /^reorder$/i }));
		fireEvent.keyDown(
			screen.getByRole("button", { name: /reorder alice/i }),
			{ key: "ArrowDown" },
		);
		await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["b", "a"]));
		// The visual order snaps back to the props when persistence fails.
		await waitFor(() =>
			expect(
				screen.getAllByRole("button", { name: /^Reorder / })[0],
			).toHaveAccessibleName("Reorder Alice"),
		);
	});
});

describe("modal back handling", () => {
	function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
		useModalBack(open, onClose);
		return null;
	}

	it("closes the top modal and consumes the back press", () => {
		const closeA = vi.fn();
		const closeB = vi.fn();
		render(
			<>
				<Harness open onClose={closeA} />
				<Harness open onClose={closeB} />
			</>,
		);

		expect(window.__tripwireHandleBack?.()).toBe(true);
		expect(closeB).toHaveBeenCalledTimes(1);
		expect(closeA).not.toHaveBeenCalled();
	});

	it("lets the page handle back when nothing is open", () => {
		render(<Harness open={false} onClose={vi.fn()} />);
		expect(window.__tripwireHandleBack?.()).toBe(false);
	});
});

describe("update download size and safe area", () => {
	it("shows the real decimal size of the release asset", () => {
		expect(formatBytes(15_746_235)).toBe("15.7 MB");
		expect(formatBytes(1_500)).toBe("2 KB");
		expect(formatBytes(0)).toBe("");
	});

	it("parses and applies native system-bar insets", () => {
		const insets = parseSafeArea(
			'{"top":24,"bottom":48,"left":0,"right":0}',
		);
		expect(insets).toEqual({ top: 24, bottom: 48, left: 0, right: 0 });
		expect(parseSafeArea("not json")).toBeNull();
		expect(parseSafeArea('{"top":-2,"bottom":"x"}')).toEqual({
			top: 0,
			bottom: 0,
			left: 0,
			right: 0,
		});

		const root = document.createElement("div");
		applySafeArea(insets!, root);
		expect(root.style.getPropertyValue("--safe-top")).toBe("24px");
		expect(root.style.getPropertyValue("--safe-bottom")).toBe("48px");
	});
});

// --- update dialog ---

function fakeUpdater(overrides: Partial<Updater> = {}): Updater {
	return {
		status: "available",
		visible: true,
		current: "1.0.0",
		release: {
			tag: "tripwire-1.2.0",
			version: "1.2.0",
			title: "Tripwire 1.2.0",
			notes: "## What's new\n- Latest change",
			apkUrl: "https://example.test/app.apk",
			apkName: "Tripwire-1.2.0.apk",
			apkSize: 1024,
			htmlUrl: "https://example.test/1.2.0",
		},
		history: [],
		progress: null,
		error: null,
		needsInstallPermission: false,
		lastChecked: null,
		check: vi.fn(),
		download: vi.fn(),
		skip: vi.fn(),
		dismiss: vi.fn(),
		reopen: vi.fn(),
		openReleasePage: vi.fn(),
		openInstallSettings: vi.fn(),
		...overrides,
	};
}

describe("UpdateDialog", () => {
	it("keeps the single changelog when only one release was skipped", () => {
		render(<UpdateDialog updater={fakeUpdater()} />);
		expect(screen.getByText("Latest change")).toBeInTheDocument();
		expect(screen.queryByText("Tripwire 1.2.0")).not.toBeInTheDocument();
	});

	it("adds a version header per skipped release", () => {
		render(
			<UpdateDialog
				updater={fakeUpdater({
					history: [
						{
							version: "1.1.0",
							title: "Tripwire 1.1.0",
							notes: "## What's new\n- Older change",
							htmlUrl: "https://example.test/1.1.0",
						},
						{
							version: "1.2.0",
							title: "Tripwire 1.2.0",
							notes: "## What's new\n- Latest change",
							htmlUrl: "https://example.test/1.2.0",
						},
					],
				})}
			/>,
		);
		expect(screen.getByText("Tripwire 1.1.0")).toBeInTheDocument();
		expect(screen.getByText("Tripwire 1.2.0")).toBeInTheDocument();
		expect(screen.getByText("New")).toBeInTheDocument();
		expect(screen.getByText("Older change")).toBeInTheDocument();
	});
});

// --- TransactionList ---

// Rows shaped exactly like the Wails bindings (TransactionView): the UI
// stays dumb about semantics - icon, title and subtitle come straight from
// the pre-computed `type` and `counterparty` fields, amounts stay signed
// integer cents.
type Row = NonNullable<
	NonNullable<models.DayGroup>["txs"]
>[number];

function row(overrides: Partial<Row>): Row {
	return {
		id: "R1",
		date: "2026-04-28 14:22:05",
		description: "Merchant Payment to 7408526 - FAITH NJOKI BACHIA",
		status: "Completed",
		amount: -245000,
		balance: 1000000,
		category: "Buy Goods",
		type: "till",
		counterparty: "FAITH NJOKI BACHIA",
		counterpartyKey: "FAITH NJOKI BACHIA",
		customCategoryId: "",
		customCategoryName: "",
		customCategoryIcon: "",
		...overrides,
	};
}

const groups: Group[] = [
	{
		dayKey: "2026-04-28",
		endBalance: 1000000,
		endOwed: 0,
		txs: [
			row({ id: "R1", amount: -245000, type: "till", counterparty: "FAITH NJOKI BACHIA" }),
			row({
				id: "R2",
				description: "Customer Transfer to - JOHN DOE",
				amount: -50000,
				type: "send_money",
				counterparty: "JOHN DOE",
				category: "Send Money",
			}),
			row({
				id: "R3",
				description: "Airtime Purchase",
				amount: -50000,
				type: "airtime",
				counterparty: "",
				category: "Airtime",
			}),
			row({
				id: "R4",
				description: "Send Money Reversal via API from - HARDEEP SINGH",
				amount: 50000,
				type: "reversal",
				counterparty: "HARDEEP SINGH",
				category: "Other",
			}),
		],
	},
];

describe("TransactionList", () => {
	it("renders the counterparty as the primary line", () => {
		render(<TransactionList groups={groups} showPagination={false} />);
		expect(screen.getByText("FAITH NJOKI BACHIA")).toBeInTheDocument();
		expect(screen.getByText("JOHN DOE")).toBeInTheDocument();
		expect(screen.getByText("HARDEEP SINGH")).toBeInTheDocument();
	});

	it("falls back to the type label when no counterparty exists", () => {
		render(<TransactionList groups={groups} showPagination={false} />);
		// "Airtime Purchase" names no counterparty: primary is the type label,
		// and the type label is not duplicated in the subtitle.
		expect(screen.getByText("Airtime")).toBeInTheDocument();
		expect(screen.queryByText("Airtime · 14:22")).not.toBeInTheDocument();
	});

	it("shows the type label with time as the subtitle", () => {
		render(<TransactionList groups={groups} showPagination={false} />);
		expect(screen.getByText("Buy Goods · 14:22")).toBeInTheDocument();
		expect(screen.getByText("Send Money · 14:22")).toBeInTheDocument();
	});

	it("maps types to distinct icons via plain lookup", () => {
		expect(typeStyle("till").icon).not.toBe(typeStyle("send_money").icon);
		expect(typeStyle("paybill").label).toBe("Pay Bill");
		expect(typeStyle("fuliza").label).toBe("Fuliza");
		expect(typeStyle("reversal").label).toBe("Reversal");
		// Unknown future types degrade gracefully instead of crashing.
		expect(typeStyle("something_new").label).toBe("Other");
	});

	it("renders signed amounts from integer cents without floats", () => {
		expect(formatAmount(-245000)).toBe("-KES 2,450.00");
		expect(formatAmount(50000)).toBe("+KES 500.00");
	});

	it("opens the category picker from the badge without expanding the row", () => {
		const onSetCategory = vi.fn();
		render(
			<TransactionList
				groups={groups}
				showPagination={false}
				onSetCategory={onSetCategory}
			/>,
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: /Set category for FAITH NJOKI BACHIA/,
			}),
		);
		expect(onSetCategory).toHaveBeenCalledTimes(1);
		expect(onSetCategory.mock.calls[0][0].id).toBe("R1");
		// The badge is a sibling tap target: labelling must not expand details.
		expect(screen.queryByText("Description")).not.toBeInTheDocument();
	});

	it("shows an assigned category instead of the type in the row", () => {
		const assigned: Group[] = [
			{
				dayKey: "2026-04-28",
				endBalance: 1000000,
				endOwed: 0,
				txs: [
					row({
						customCategoryId: "c1",
						customCategoryName: "Food",
						customCategoryIcon: "utensils",
					}),
				],
			},
		];
		render(
			<TransactionList
				groups={assigned}
				showPagination={false}
				onSetCategory={vi.fn()}
			/>,
		);
		expect(screen.getByText("Food · 14:22")).toBeInTheDocument();
		const badge = screen.getByRole("button", { name: /currently Food/ });
		expect(badge).toBeInTheDocument();
		// The themed icon replaces the transaction type's icon in the badge.
		expect(badge.querySelector("svg")).not.toBeNull();
	});
});

describe("category icons", () => {
	it("maps the first-build emojis to their themed icon", () => {
		expect(resolveCategoryIcon("🍔")).toBe("utensils");
		expect(resolveCategoryIcon("🛒")).toBe("shopping-cart");
		// An icon key passes through untouched.
		expect(resolveCategoryIcon("shopping-cart")).toBe("shopping-cart");
	});

	it("finds icons by the words people actually type", () => {
		const names = (query: string) =>
			searchCategoryIcons(query).map((def) => def.name);
		expect(names("bangi")).toEqual(
			expect.arrayContaining(["leaf", "cigarette", "cannabis"]),
		);
		expect(names("weed")).toContain("cannabis");
		expect(names("matatu")).toContain("bus");
		expect(names("pombe")).toContain("beer");
		expect(names("chama").length).toBeGreaterThan(0);
		expect(names("zzzz")).toHaveLength(0);
	});
});

describe("counterparty display names", () => {
	it("drops numeric tokens but keeps the full name for filtering", () => {
		expect(counterpartyDisplayName("TERESIA WAKERA MUNENE")).toBe(
			"TERESIA WAKERA MUNENE",
		);
		expect(counterpartyDisplayName("KPLC PREPAID Acc. 01450540651")).toBe(
			"KPLC PREPAID",
		);
		expect(counterpartyDisplayName("NAIROBI BUDGET BUTCHERY 2")).toBe(
			"NAIROBI BUDGET BUTCHERY",
		);
		expect(counterpartyDisplayName("RICHARD 2547***287")).toBe("RICHARD");
		// A name that is only a number has nothing to strip to.
		expect(counterpartyDisplayName("0712***752")).toBe("0712***752");
		// A dropped reference must not leave its separator behind.
		expect(counterpartyDisplayName("517819 - IM BANK LIMITED")).toBe(
			"IM BANK LIMITED",
		);
	});
});

describe("transactions search", () => {
	const g = (): Group[] => [
		{
			dayKey: "2026-04-28",
			endBalance: 0,
			endOwed: 0,
			txs: [
				row({
					description:
						"Business Payment from 303031 - Absa Bank Kenya PLC. via API. Original conversation ID is 66922406.",
					category: "Receive",
					type: "receive",
					counterparty: "Absa Bank Kenya PLC",
				}),
			],
		},
	];

	it("matches every search word, not the query as one substring", () => {
		// The words are non-adjacent in the source, so a substring match fails.
		expect(filterGroups(g(), "Absa PLC", "all", "all", "", "")).toHaveLength(
			1,
		);
		expect(
			filterGroups(g(), "absa bank", "all", "all", "", ""),
		).toHaveLength(1);
		expect(
			filterGroups(g(), "Absa Equity", "all", "all", "", ""),
		).toHaveLength(0);
	});
});

describe("custom category filter", () => {
	const customGroups = (): Group[] => [
		{
			dayKey: "2026-04-28",
			endBalance: 0,
			endOwed: 0,
			txs: [
				row({
					id: "R1",
					customCategoryId: "c-food",
					customCategoryName: "Food",
					customCategoryIcon: "🍔",
				}),
				row({ id: "R2" }),
				row({
					id: "R3",
					customCategoryId: "c-travel",
					customCategoryName: "Travel",
					customCategoryIcon: "🚌",
				}),
			],
		},
	];

	it("keeps only the requested category, preserving the day header", () => {
		const out = filterByCustomCategory(customGroups(), "c-food");
		expect(out).toHaveLength(1);
		expect(out[0].dayKey).toBe("2026-04-28");
		expect(out[0].txs.map((t) => t.id)).toEqual(["R1"]);
	});

	it("treats none as the unlabelled rows and all as no filter", () => {
		expect(
			filterByCustomCategory(customGroups(), "none")[0].txs.map((t) => t.id),
		).toEqual(["R2"]);
		expect(filterByCustomCategory(customGroups(), "all")[0].txs).toHaveLength(
			3,
		);
	});

	it("drops a whole day when nothing in it matches", () => {
		expect(filterByCustomCategory(customGroups(), "c-gone")).toHaveLength(0);
	});
});

describe("CounterpartyCard", () => {
	const cps: analysis.Counterparty[] = [
		{
			name: "Alice Wanjiru 0712000001",
			number: "0712000001",
			count: 3,
			amount: -50000,
			in: 0,
			out: 50000,
		},
		{
			name: "Bob Otieno",
			number: "888880",
			count: 2,
			amount: 200000,
			in: 200000,
			out: 0,
		},
		{
			name: "Calvin Kamara",
			number: "07******752",
			count: 1,
			amount: -10000,
			in: 0,
			out: 10000,
		},
	];

	const rows = () =>
		screen
			.getAllByTestId("counterparty-row")
			.map((r) => r.textContent ?? "");

	it("defaults to money out, ranked, with the number beside the name", () => {
		render(<CounterpartyCard counterparties={cps} />);
		const texts = rows();
		// Bob has only inflow, so the default Out view leaves him out.
		expect(texts).toHaveLength(2);
		expect(texts[0]).toContain("Alice Wanjiru");
		expect(texts[0]).toContain("0712000001");
		expect(texts[0]).not.toContain("Alice Wanjiru 0712000001");
		expect(texts[1]).toContain("Calvin Kamara");
		// Masked numbers still surface as the number line.
		expect(texts[1]).toContain("07******752");
	});

	it("re-ranks by money in when toggled", () => {
		render(<CounterpartyCard counterparties={cps} />);
		fireEvent.click(screen.getByRole("button", { name: "Money in" }));
		const texts = rows();
		expect(texts).toHaveLength(1);
		expect(texts[0]).toContain("Bob Otieno");
		expect(texts[0]).toContain("888880");
	});

	it("remembers the last direction across remounts", () => {
		const first = render(<CounterpartyCard counterparties={cps} />);
		fireEvent.click(screen.getByRole("button", { name: "Money in" }));
		first.unmount();
		// A fresh mount reads the persisted direction instead of the
		// default Out ranking.
		render(<CounterpartyCard counterparties={cps} />);
		expect(screen.getByRole("button", { name: "Money in" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(rows()[0]).toContain("Bob Otieno");
	});

	it("hands the display name to the search filter on tap", () => {
		const onSelect = vi.fn();
		render(
			<CounterpartyCard counterparties={cps} onSelectCounterparty={onSelect} />,
		);
		fireEvent.click(screen.getAllByTestId("counterparty-row")[0]);
		expect(onSelect).toHaveBeenCalledWith("Alice Wanjiru");
	});

	it("caps the leaderboard at five names", () => {
		const many: analysis.Counterparty[] = Array.from({ length: 8 }, (_, i) => ({
			name: `Person ${i + 1}`,
			number: "",
			count: 1,
			amount: -(i + 1) * 1000,
			in: 0,
			out: (i + 1) * 1000,
		}));
		render(<CounterpartyCard counterparties={many} />);
		expect(rows()).toHaveLength(5);
	});
});

describe("privacy mode", () => {
	it("defaults off and round-trips through localStorage", () => {
		expect(getPrivacyModeEnabled()).toBe(false);
		setPrivacyMode(true);
		expect(getPrivacyModeEnabled()).toBe(true);
		expect(store.get(PRIVACY_MODE_KEY)).toBe("1");
		setPrivacyMode(false);
		expect(getPrivacyModeEnabled()).toBe(false);
		expect(store.get(PRIVACY_MODE_KEY)).toBe("0");
	});

	it("toggles against the stored value", () => {
		togglePrivacyMode();
		expect(getPrivacyModeEnabled()).toBe(true);
		togglePrivacyMode();
		expect(getPrivacyModeEnabled()).toBe(false);
	});
});

describe("sms result filtering", () => {
	const noon = (y: number, month: number, d: number) =>
		new Date(y, month - 1, d, 12, 0, 0, 0).getTime();
	const rows: models.SmsParseResult[] = [
		{ sourceId: "OLD", kind: "imported", dateMs: noon(2026, 1, 5), body: "old mpesa" },
		{
			sourceId: "NEW",
			kind: "imported",
			dateMs: noon(2026, 3, 9),
			body: "new mpesa",
			address: "MPESA",
		},
		{ sourceId: "MID", kind: "unsupported", dateMs: noon(2026, 2, 20), body: "mid" },
		{ sourceId: "NODATE", kind: "malformed", body: "no date" },
	];

	it("orders results today-to-past (newest first)", () => {
		expect(filterSmsResults(rows).map((r) => r.sourceId)).toEqual([
			"NEW",
			"MID",
			"OLD",
			"NODATE",
		]);
	});

	it("filters by kind and by free text across sender and body", () => {
		expect(
			filterSmsResults(rows, { kind: "unsupported" }).map((r) => r.sourceId),
		).toEqual(["MID"]);
		expect(filterSmsResults(rows, { query: "mpesa" }).map((r) => r.sourceId)).toEqual([
			"NEW",
			"OLD",
		]);
		expect(filterSmsResults(rows, { query: "nomatch" })).toHaveLength(0);
	});

	it("applies an inclusive received-date window and drops undated rows", () => {
		expect(
			filterSmsResults(rows, { from: "2026-02-01", to: "2026-02-28" }).map(
				(r) => r.sourceId,
			),
		).toEqual(["MID"]);
		// Both bounds on one day keep that day's messages.
		expect(
			filterSmsResults(rows, { from: "2026-03-09", to: "2026-03-09" }).map(
				(r) => r.sourceId,
			),
		).toEqual(["NEW"]);
		// A from-only window still excludes rows with no received time.
		expect(
			filterSmsResults(rows, { from: "2020-01-01" }).map((r) => r.sourceId),
		).toEqual(["NEW", "MID", "OLD"]);
	});

	it("spans a full local day between the start and end bounds", () => {
		const start = dayStartMs("2026-03-09");
		const end = dayEndMs("2026-03-09");
		expect(start).not.toBeNull();
		expect(end).not.toBeNull();
		expect(end! - start!).toBe(24 * 60 * 60 * 1000 - 1);
		expect(dayStartMs("")).toBeNull();
		expect(dayEndMs("nope")).toBeNull();
	});
});

describe("recurring plans", () => {
	const plan = (over: Partial<PlanLike> = {}): PlanLike => ({
		...emptyPlan(new Date(2026, 0, 15)),
		id: "plan-1",
		createdAt: "2026-01-15T09:00:00Z",
		name: "Agnes Muiruri",
		kind: "send",
		number: "0712345678",
		amount: 25_000,
		cadence: "monthly",
		anchorDay: 31,
		dueTime: "09:00",
		...over,
	});

	it("clamps a monthly anchor to the last day of a shorter month", () => {
		const due = nextDue(plan(), new Date(2026, 1, 10));
		expect(due.getMonth()).toBe(1);
		expect(due.getDate()).toBe(28);
		expect(due.getHours()).toBe(9);
	});

	it("finds the next weekly and bi-weekly occurrence", () => {
		const weekly = nextDue(plan({ cadence: "weekly", anchorWeekday: 5 }), new Date(2026, 9, 21));
		expect(weekly.getDay()).toBe(5);
		expect(weekly.getDate()).toBe(23);

		const biweekly = nextDue(
			plan({
				cadence: "bi-weekly",
				anchorWeekday: 5,
				createdAt: "2026-10-02T09:00:00Z",
			}),
			new Date(2026, 9, 20),
		);
		expect(biweekly.getDay()).toBe(5);
		expect(biweekly.getDate()).toBe(30);
	});

	it("matches last paid by paybill number and account, outflows only", () => {
		const kplc = plan({
			name: "KPLC",
			kind: "paybill",
			number: "888880",
			account: "01450540651",
			amount: 0,
		});
		const txs: Transaction[] = [
			{ id: "1", date: "2026-02-01 10:00:00", description: "Pay Bill Online to 888880 Acc. 01450540651", status: "Success", amount: -245_000, balance: 0 },
			{ id: "2", date: "2026-03-01 10:00:00", description: "Pay Bill Online to 888880 Acc. 01450540651", status: "Success", amount: -230_000, balance: 0 },
			{ id: "3", date: "2026-03-02 10:00:00", description: "Pay Bill Online to 888880 Acc. 9999", status: "Success", amount: -1_000, balance: 0 },
			{ id: "4", date: "2026-04-01 10:00:00", description: "Funds received from - 888880 KPLC", status: "Success", amount: 5_000, balance: 0 },
		];
		expect(lastPaidOf(kplc, txs)).toEqual({ date: "2026-03-01 10:00:00", amount: 230_000 });
	});

	it("matches a send plan by the name printed in the statement", () => {
		const txs: Transaction[] = [
			{ id: "1", date: "2026-02-03 08:00:00", description: "Customer Transfer to - AGNES MUIRURI 0712***678", status: "Success", amount: -25_000, balance: 0 },
		];
		expect(lastPaidOf(plan(), txs)?.date).toBe("2026-02-03 08:00:00");
	});

	it("recognises another plan for the same contact", () => {
		expect(samePlanTarget(plan(), "send", "254712345678", "")).toBe(true);
		expect(samePlanTarget(plan(), "pochi", "0712345678", "")).toBe(false);
		expect(
			samePlanTarget(
				plan({ kind: "paybill", number: "888880", account: "A1" }),
				"paybill",
				"888880",
				"a1",
			),
		).toBe(true);
		expect(
			samePlanTarget(
				plan({ kind: "paybill", number: "888880", account: "A1" }),
				"paybill",
				"888880",
				"A2",
			),
		).toBe(false);
	});

	it("splits a wide detected range into amount bands", () => {
		const payment = {
			counterparty: "WALTER KAGUCHIA 0715448705",
			count: 9,
			type: "send_money",
			amount: 38_700,
			amountMin: 6_900,
			amountMax: 1_650_000,
			cadence: "monthly",
			medianGapDays: 30,
			firstDate: "2026-03-27 12:30:32",
			lastDate: "2026-10-05 07:59:33",
		} satisfies RecurringPayment;
		const amounts = [6_900, 30_500, 35_900, 38_500, 38_700, 58_300, 1_400_000, 1_650_000];
		const txs: Transaction[] = amounts.map((amount, i) => ({
			id: String(i),
			date: "2026-10-05 07:59:33",
			description: "Customer Transfer to - WALTER KAGUCHIA 0715448705",
			status: "Success",
			amount: -amount,
			balance: 0,
		}));

		const bands = amountBands(txs, payment);
		expect(bands).toHaveLength(2);
		expect(bands[0].count).toBe(6);
		expect(bands[0].min).toBe(6_900);
		expect(bands[0].max).toBe(58_300);
		expect(bands[1].count).toBe(2);
		expect(bands[1].min).toBe(1_400_000);
	});

	it("does not split a normal bill's amount variation", () => {
		const payment = {
			counterparty: "KPLC",
			count: 4,
			type: "paybill",
			amount: 25_000,
			amountMin: 20_000,
			amountMax: 30_000,
			cadence: "monthly",
			medianGapDays: 30,
			firstDate: "2026-01-01 10:00:00",
			lastDate: "2026-04-01 10:00:00",
		} satisfies RecurringPayment;
		const txs: Transaction[] = [20_000, 25_000, 27_000, 30_000].map((amount, i) => ({
			id: String(i),
			date: "2026-04-01 10:00:00",
			description: "Pay Bill Online to 888880 - KPLC",
			status: "Success",
			amount: -amount,
			balance: 0,
		}));
		expect(amountBands(txs, payment)).toEqual([]);
	});

	it("marks the detected amount as tracked once a plan covers it", () => {
		const payment = {
			counterparty: "WALTER KAGUCHIA 0715448705",
			count: 9,
			type: "send_money",
			amount: 38_700,
			amountMin: 6_900,
			amountMax: 1_650_000,
			cadence: "monthly",
			medianGapDays: 30,
			firstDate: "2026-03-27 12:30:32",
			lastDate: "2026-10-05 07:59:33",
		} satisfies RecurringPayment;

		const walter = plan({ name: "WALTER KAGUCHIA", amount: 38_500 });
		expect(planCoversDetected(walter, payment, 38_500)).toBe(true);
		expect(planCoversDetected(walter, payment, 1_525_000)).toBe(false);
		expect(planCoversDetected(walter, payment)).toBe(true);
		expect(planCoversDetected(plan({ name: "KPLC", amount: 38_500 }), payment)).toBe(false);
	});

	it("prefills a tracked send payment's phone and clean name", () => {
		const draft = planFromDetected({
			counterparty: "WALTER KAGUCHIA 0715448705",
			count: 9,
			type: "send_money",
			amount: 38_700,
			amountMin: 6_900,
			amountMax: 1_650_000,
			cadence: "monthly",
			medianGapDays: 30,
			firstDate: "2026-03-27 12:30:32",
			lastDate: "2026-10-05 07:59:33",
		});
		expect(draft.kind).toBe("send");
		expect(draft.number).toBe("0715448705");
		expect(draft.name).toBe("WALTER KAGUCHIA");
		expect(draft.amount).toBe(38_700);
	});

	it("builds a play script from the plan's target", () => {
		const script = planScript(
			plan({ kind: "paybill", number: "888880", account: "01450540651" }),
			"250",
		);
		expect(script?.kind).toBe("paybill");
		expect(script?.steps.map((s) => s.input)).toEqual(["6", "1", "888880", "01450540651", "250", "1"]);
		expect(planScript(plan({ kind: "till", number: "12" }), "250")).toBeNull();
	});
});
