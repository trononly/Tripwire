import { useCallback, useEffect, useState } from "react";

import { cacheChangelog, cachedChangelogFor } from "@/lib/changelog";
import { getInstalledVersion } from "@/lib/update-bridge";
import { fetchReleaseNotes, type ReleaseNotesInfo } from "@/lib/updater";

export interface Changelog {
	/** Installed version the notes describe, "" when unknown (desktop). */
	version: string;
	/** Resolved release notes, or null while none are available. */
	release: ReleaseNotesInfo | null;
	loading: boolean;
	error: string | null;
	/** Re-fetch, ignoring the cache. */
	refresh: () => void;
}

/**
 * Warm the changelog cache the moment the app opens, so the Settings dialog
 * has the installed build's notes ready - and offline-capable - before it is
 * ever opened. One request per launch; failures stay silent because the
 * dialog fetches again on demand. No-op without an installed version
 * (desktop, bridgeless builds).
 */
export function useChangelogPrefetch(): void {
	useEffect(() => {
		const version = getInstalledVersion()?.versionName ?? "";
		if (!version) return;
		const controller = new AbortController();
		fetchReleaseNotes(version, controller.signal).then((result) => {
			if (controller.signal.aborted) return;
			if (result.ok && result.release) cacheChangelog(result.release);
		});
		return () => controller.abort();
	}, []);
}

/**
 * Changelog for the currently installed build. Reads the cached notes first
 * so the version's changes show instantly (and offline); only on a cache miss
 * - or an explicit refresh - does it hit the GitHub releases API. Pass
 * `enabled = false` to hold off entirely until the dialog is opened.
 */
export function useChangelog(enabled = true): Changelog {
	const [version] = useState(() => getInstalledVersion()?.versionName ?? "");
	const [release, setRelease] = useState<ReleaseNotesInfo | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		if (!enabled || !version) return;

		// Cache first: the launch prefetch usually means no network here.
		if (reload === 0) {
			const hit = cachedChangelogFor(version);
			if (hit) {
				setRelease(hit);
				setError(null);
				return;
			}
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		fetchReleaseNotes(version, controller.signal)
			.then((result) => {
				if (controller.signal.aborted) return;
				if (!result.ok) {
					setError(result.error);
					return;
				}
				setRelease(result.release);
				if (result.release) cacheChangelog(result.release);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [version, reload, enabled]);

	const refresh = useCallback(() => setReload((n) => n + 1), []);

	return { version, release, loading, error, refresh };
}
