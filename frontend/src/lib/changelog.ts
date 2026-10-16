// Local cache for the in-app "Changelog": release notes keyed by version, so
// the installed build's notes are ready the moment they are needed (offline
// included) and the notes for an update we just discovered survive the
// install. Pure read/write plus validation - no network, no React - so it
// stays trivially testable.
import { normalizeVersion, type ReleaseNotesInfo } from "@/lib/updater";

export const CHANGELOG_CACHE_KEY = "tripwire.changelog-cache";

/** Versions to keep before the oldest entry is evicted. */
const MAX_ENTRIES = 5;

export interface ChangelogCacheEntry extends ReleaseNotesInfo {
	/** Epoch ms the entry was cached. */
	fetchedAt: number;
}

/** Notes per normalized version, keyed by that version. */
export type ChangelogCache = Record<string, ChangelogCacheEntry>;

function parseEntry(value: unknown): ChangelogCacheEntry | null {
	if (typeof value !== "object" || value === null) return null;
	const entry = value as Partial<ChangelogCacheEntry>;
	if (typeof entry.version !== "string" || entry.version === "") return null;
	if (typeof entry.notes !== "string") return null;
	return {
		version: entry.version,
		title: typeof entry.title === "string" ? entry.title : "",
		notes: entry.notes,
		htmlUrl: typeof entry.htmlUrl === "string" ? entry.htmlUrl : "",
		fetchedAt: typeof entry.fetchedAt === "number" ? entry.fetchedAt : 0,
	};
}

/** The whole cache, keyed by normalized version. Empty when nothing is stored. */
export function readChangelogCache(): ChangelogCache {
	try {
		const raw = localStorage.getItem(CHANGELOG_CACHE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return {};
		const cache: ChangelogCache = {};
		for (const value of Object.values(parsed as Record<string, unknown>)) {
			const entry = parseEntry(value);
			if (entry) cache[normalizeVersion(entry.version)] = entry;
		}
		return cache;
	} catch {
		/* private mode / malformed payload */
		return {};
	}
}

/** Persist the whole map, replacing what was there. */
export function writeChangelogCache(cache: ChangelogCache): void {
	try {
		localStorage.setItem(CHANGELOG_CACHE_KEY, JSON.stringify(cache));
	} catch {
		/* private mode: cache stays session-only */
	}
}

/** Cached notes for `version`, or null when that version is not stored. */
export function cachedChangelogFor(version: string): ReleaseNotesInfo | null {
	const key = normalizeVersion(version);
	if (!key) return null;
	const entry = readChangelogCache()[key];
	if (!entry) return null;
	return {
		version: entry.version,
		title: entry.title,
		notes: entry.notes,
		htmlUrl: entry.htmlUrl,
	};
}

/**
 * Store notes under the version they describe, keeping the newest few entries
 * so a pending update's notes coexist with the installed build's.
 */
export function cacheChangelog(notes: ReleaseNotesInfo): void {
	const key = normalizeVersion(notes.version);
	if (!key) return;
	const cache = readChangelogCache();
	cache[key] = { ...notes, version: key, fetchedAt: Date.now() };
	const keys = Object.keys(cache);
	if (keys.length > MAX_ENTRIES) {
		keys.sort((a, b) => cache[a].fetchedAt - cache[b].fetchedAt);
		for (const stale of keys.slice(0, keys.length - MAX_ENTRIES)) {
			delete cache[stale];
		}
	}
	writeChangelogCache(cache);
}
