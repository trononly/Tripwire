// Local cache for the in-app "Changelog". The release notes for the
// installed version are fetched from GitHub at most once, then reused on
// every later open (offline included) until the version changes or the user
// asks to refresh. Pure read/write plus validation, so it stays testable
// without a network or a React render.
import type { ReleaseNotesInfo } from "@/lib/updater";

export const CHANGELOG_CACHE_KEY = "tripwire.changelog-cache";

export interface ChangelogCacheEntry extends ReleaseNotesInfo {
	/** Epoch ms the entry was cached. */
	fetchedAt: number;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value !== "";
}

/** Cached changelog, or null when nothing usable is stored. */
export function readChangelogCache(): ChangelogCacheEntry | null {
	try {
		const raw = localStorage.getItem(CHANGELOG_CACHE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const entry = parsed as Partial<ChangelogCacheEntry>;
		if (!isNonEmptyString(entry.version) || typeof entry.notes !== "string") {
			return null;
		}
		return {
			version: entry.version,
			title: typeof entry.title === "string" ? entry.title : "",
			notes: entry.notes,
			htmlUrl: typeof entry.htmlUrl === "string" ? entry.htmlUrl : "",
			fetchedAt: typeof entry.fetchedAt === "number" ? entry.fetchedAt : 0,
		};
	} catch {
		/* private mode / malformed payload */
		return null;
	}
}

/** Cache the changelog for one version, replacing any previous entry. */
export function writeChangelogCache(entry: ChangelogCacheEntry): void {
	try {
		localStorage.setItem(CHANGELOG_CACHE_KEY, JSON.stringify(entry));
	} catch {
		/* private mode: cache stays session-only */
	}
}

/** The cached changelog for `version`, or null when absent / a different build. */
export function cachedChangelogFor(version: string): ReleaseNotesInfo | null {
	if (!version) return null;
	const cache = readChangelogCache();
	if (!cache || cache.version !== version) return null;
	return {
		version: cache.version,
		title: cache.title,
		notes: cache.notes,
		htmlUrl: cache.htmlUrl,
	};
}
