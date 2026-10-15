// Checks the Tripwire GitHub Releases page for a newer build.
// The release workflow (release.yml) publishes one APK per `tripwire-*` tag
// named `Tripwire-<version>.apk`, and the generated release notes double as
// the in-app "What's new" text.

export const GITHUB_OWNER = "trononly";
export const GITHUB_REPO = "Tripwire";

export const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export interface ReleaseAsset {
	name: string;
	browser_download_url: string;
	size: number;
}

export interface ReleaseInfo {
	/** Raw tag, e.g. "tripwire-1.2.3". */
	tag: string;
	/** Normalized version, e.g. "1.2.3". */
	version: string;
	/** Release title, e.g. "Tripwire 1.2.3". */
	title: string;
	/** Release body - shown verbatim as "What's new". */
	notes: string;
	/** Direct download URL of the Tripwire-*.apk asset. */
	apkUrl: string;
	/** Asset file name, e.g. "Tripwire-1.2.3.apk". */
	apkName: string;
	/** Asset size in bytes (0 when unknown). */
	apkSize: number;
	/** Human releases page, used as the manual fallback. */
	htmlUrl: string;
}

/** "tripwire-1.2.3" -> "1.2.3"; "v1.2.3" -> "1.2.3"; "" stays "". */
export function normalizeVersion(tag: string): string {
	const t = tag.trim();
	for (const prefix of ["tripwire-", "tripwire_", "v"]) {
		if (t.toLowerCase().startsWith(prefix)) return t.slice(prefix.length);
	}
	return t;
}

/**
 * Compare two version strings numerically per dot-separated segment.
 * Returns negative when a < b, 0 when equal, positive when a > b.
 * Non-numeric suffixes (e.g. "-debug", "+build") are ignored for ordering
 * except that a suffixed version sorts below its bare counterpart.
 */
export function compareVersions(a: string, b: string): number {
	const split = (v: string) => {
		const [core, ...rest] = v.split(/[-+]/);
		return {
			nums: core.split(".").map((s) => {
				const n = parseInt(s, 10);
				return Number.isFinite(n) ? n : 0;
			}),
			suffix: rest.join("-"),
		};
	};
	const x = split(a);
	const y = split(b);
	const len = Math.max(x.nums.length, y.nums.length);
	for (let i = 0; i < len; i++) {
		const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
		if (d !== 0) return d;
	}
	if (x.suffix === y.suffix) return 0;
	// Bare release sorts above any suffixed (pre-release/debug) build.
	if (x.suffix === "") return 1;
	if (y.suffix === "") return -1;
	return x.suffix < y.suffix ? -1 : 1;
}

/** True when `latest` is a strictly newer release than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
	if (!latest || !current) return false;
	return (
		compareVersions(normalizeVersion(latest), normalizeVersion(current)) > 0
	);
}

interface GithubReleaseApi {
	tag_name: string;
	name: string;
	body: string | null;
	html_url: string;
	assets: ReleaseAsset[];
}

/**
 * Pick the APK asset the updater downloads. Prefers the release-workflow
 * artifact (`Tripwire-*.apk`, excluding `-debug` builds) and falls back to
 * the first `.apk` asset so hand-made releases still update.
 */
export function pickApkAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
	if (!Array.isArray(assets) || assets.length === 0) return null;
	const apks = assets.filter((a) =>
		typeof a?.name === "string" &&
		a.name.toLowerCase().endsWith(".apk"),
	);
	if (apks.length === 0) return null;
	const official = apks.find(
		(a) =>
			a.name.startsWith("Tripwire-") && !a.name.includes("-debug"),
	);
	return official ?? apks[0];
}

function toReleaseInfo(api: GithubReleaseApi): ReleaseInfo | null {
	if (!api || typeof api.tag_name !== "string") return null;
	const apk = pickApkAsset(api.assets ?? []);
	if (!apk) return null;
	return {
		tag: api.tag_name,
		version: normalizeVersion(api.tag_name),
		title:
			typeof api.name === "string" && api.name !== ""
				? api.name
				: `Tripwire ${normalizeVersion(api.tag_name)}`,
		notes: typeof api.body === "string" ? api.body : "",
		apkUrl: apk.browser_download_url,
		apkName: apk.name,
		apkSize: typeof apk.size === "number" ? apk.size : 0,
		htmlUrl: api.html_url ?? RELEASES_URL,
	};
}

export type LatestReleaseResult =
	| { ok: true; release: ReleaseInfo | null }
	| { ok: false; error: string };

/**
 * Fetch the latest GitHub Release. Resolves `{release: null}` when there is
 * no latest release (fresh repo), and `{error}` on network/API failures so
 * callers can stay silent offline instead of alarming the user.
 */
export async function fetchLatestRelease(
	signal?: AbortSignal,
): Promise<LatestReleaseResult> {
	let res: Response;
	try {
		res = await fetch(LATEST_RELEASE_API, {
			signal,
			headers: { Accept: "application/vnd.github+json" },
		});
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError")
			return { ok: false, error: "cancelled" };
		return { ok: false, error: "no connection" };
	}
	if (res.status === 404) return { ok: true, release: null };
	if (!res.ok) return { ok: false, error: `releases check failed (${res.status})` };
	let api: GithubReleaseApi;
	try {
		api = (await res.json()) as GithubReleaseApi;
	} catch {
		return { ok: false, error: "bad releases response" };
	}
	const release = toReleaseInfo(api);
	if (!release) return { ok: false, error: "latest release has no APK" };
	return { ok: true, release };
}
