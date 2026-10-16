import { useCallback, useEffect, useState } from "react";

import { getInstalledVersion } from "@/lib/update-bridge";
import {
	fetchReleaseNotes,
	type ReleaseNotesInfo,
} from "@/lib/updater";
import { cachedNotesFor, writeWhatsNewCache } from "@/lib/whats-new";

export interface WhatsNew {
	/** Installed version the notes describe, "" when unknown (desktop). */
	version: string;
	/** Resolved notes, or null while none are available. */
	release: ReleaseNotesInfo | null;
	loading: boolean;
	error: string | null;
	/** True when the notes came straight from the local cache. */
	cached: boolean;
	/** Re-fetch, ignoring the cache. */
	refresh: () => void;
}

/**
 * "What's new" for the currently installed build. Reads the cached notes
 * first so the version's changes show instantly (and offline); only on a
 * cache miss - or an explicit refresh - does it hit the GitHub releases API.
 */
export function useWhatsNew(): WhatsNew {
	const [version] = useState(() => getInstalledVersion()?.versionName ?? "");
	const [release, setRelease] = useState<ReleaseNotesInfo | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [cached, setCached] = useState(false);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		if (!version) return;

		// Cache first: no network on the common path.
		if (reload === 0) {
			const hit = cachedNotesFor(version);
			if (hit) {
				setRelease(hit);
				setCached(true);
				setError(null);
				return;
			}
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setCached(false);
		fetchReleaseNotes(version, controller.signal)
			.then((result) => {
				if (controller.signal.aborted) return;
				if (!result.ok) {
					setError(result.error);
					return;
				}
				setRelease(result.release);
				if (result.release) {
					writeWhatsNewCache({
						...result.release,
						fetchedAt: Date.now(),
					});
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [version, reload]);

	const refresh = useCallback(() => setReload((n) => n + 1), []);

	return { version, release, loading, error, cached, refresh };
}
