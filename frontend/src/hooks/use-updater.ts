import { useCallback, useEffect, useRef, useState } from "react";

import { Events } from "@wailsio/runtime";
import { isAndroidBridge } from "@/lib/sms-bridge";
import {
	canInstallPackages,
	downloadAndInstallApk,
	getInstalledVersion,
	isUpdateBridge,
	openExternalUrl,
	openInstallPermissionSettings,
	type UpdateBridgeEvent,
} from "@/lib/update-bridge";
import {
	fetchLatestRelease,
	isNewerVersion,
	type ReleaseInfo,
} from "@/lib/updater";

export type UpdaterStatus =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "ready"
	| "up-to-date"
	| "error";

export interface UpdateProgress {
	received: number;
	total: number;
}

export interface Updater {
	status: UpdaterStatus;
	/** Whether the update dialog should be shown. */
	visible: boolean;
	/** Installed version name, "" when unknown. */
	current: string;
	release: ReleaseInfo | null;
	progress: UpdateProgress | null;
	error: string | null;
	/** True when the system install toggle blocks the update. */
	needsInstallPermission: boolean;
	lastChecked: number | null;
	check: (manual?: boolean) => void;
	download: () => void;
	skip: () => void;
	dismiss: () => void;
	reopen: () => void;
	openReleasePage: () => void;
	openInstallSettings: () => void;
}

const LAST_CHECK_KEY = "tripwire.update-last-check";
const SKIPPED_KEY = "tripwire.update-skipped";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readSkipped(): string {
	try {
		return localStorage.getItem(SKIPPED_KEY) ?? "";
	} catch {
		return "";
	}
}

function readLastCheck(): number {
	try {
		return Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
	} catch {
		return 0;
	}
}

/**
 * In-app updater: compares the installed build against the latest GitHub
 * Release and downloads the `Tripwire-<version>.apk` asset through the
 * native bridge, which hands it to the system installer. Auto-checks at
 * most once a day on Android; desktop and bridgeless builds stay idle.
 */
export function useUpdater(): Updater {
	const [status, setStatus] = useState<UpdaterStatus>("idle");
	const [visible, setVisible] = useState(false);
	const [current, setCurrent] = useState("");
	const [release, setRelease] = useState<ReleaseInfo | null>(null);
	const [progress, setProgress] = useState<UpdateProgress | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [needsInstallPermission, setNeedsInstallPermission] = useState(false);
	const [lastChecked, setLastChecked] = useState<number | null>(null);
	const checking = useRef(false);
	const unsubscribe = useRef<(() => void) | null>(null);

	useEffect(() => {
		setLastChecked(readLastCheck() || null);
		return () => {
			unsubscribe.current?.();
			unsubscribe.current = null;
		};
	}, []);

	const stopProgress = useCallback(() => {
		unsubscribe.current?.();
		unsubscribe.current = null;
	}, []);

	function parseBridgeEvent(ev: { data: unknown }): UpdateBridgeEvent | null {
		try {
			const raw = ev.data;
			if (typeof raw === "string") {
				return JSON.parse(raw) as UpdateBridgeEvent;
			}
			return raw as UpdateBridgeEvent;
		} catch {
			return null;
		}
	}

	const check = useCallback(
		(manual = false) => {
			if (!isAndroidBridge() || !isUpdateBridge()) return;
			if (checking.current) return;
			checking.current = true;
			setError(null);
			if (manual) setStatus("checking");

			const installed = getInstalledVersion();
			if (!installed) {
				checking.current = false;
				if (manual) {
					setError("Could not read the installed version.");
					setStatus("error");
				}
				return;
			}
			setCurrent(installed.versionName);

			void fetchLatestRelease()
				.then((result) => {
					const now = Date.now();
					try {
						localStorage.setItem(LAST_CHECK_KEY, String(now));
					} catch {
						/* private mode */
					}
					setLastChecked(now);
					if (!result.ok) {
						if (manual) {
							setError(
								result.error === "no connection"
									? "No connection. Try again when you're online."
									: result.error,
							);
							setStatus("error");
						} else {
							setStatus("idle");
						}
						return;
					}
					if (
						result.release &&
						isNewerVersion(result.release.version, installed.versionName) &&
						readSkipped() !== result.release.version
					) {
						setRelease(result.release);
						setProgress(null);
						setNeedsInstallPermission(false);
						setStatus("available");
						setVisible(true);
					} else if (manual) {
						setStatus("up-to-date");
					} else {
						setStatus("idle");
					}
				})
				.finally(() => {
					checking.current = false;
				});
		},
		[],
	);

	// Auto-check on launch, at most once a day. Silent unless an update
	// is actually available.
	useEffect(() => {
		if (!isAndroidBridge() || !isUpdateBridge()) return;
		if (Date.now() - readLastCheck() < CHECK_INTERVAL_MS) return;
		check(false);
	}, [check]);

	// Re-check the install toggle when returning from system settings so
	// the dialog clears its "allow installs" prompt on its own.
	useEffect(() => {
		const onVisible = () => {
			if (
				document.visibilityState === "visible" &&
				needsInstallPermission &&
				canInstallPackages()
			) {
				setNeedsInstallPermission(false);
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, [needsInstallPermission]);

	const download = useCallback(() => {
		if (!release) return;
		if (!canInstallPackages()) {
			setNeedsInstallPermission(true);
			return;
		}
		setNeedsInstallPermission(false);
		setError(null);
		setProgress({ received: 0, total: release.apkSize });
		setStatus("downloading");
		stopProgress();
		unsubscribe.current = Events.On("common:update", (ev) => {
			const data = parseBridgeEvent(ev);
			if (!data) return;
			if (data.state === "downloading") {
				setProgress({
					received: data.received ?? 0,
					total: data.total ?? release.apkSize,
				});
			} else if (data.state === "ready") {
				stopProgress();
				setProgress(null);
				setStatus("ready");
			} else if (data.state === "error") {
				stopProgress();
				setError(data.error || "Update failed.");
				setStatus("error");
			}
		});
		downloadAndInstallApk(release.apkUrl, release.apkName);
	}, [release, stopProgress]);

	const skip = useCallback(() => {
		if (release) {
			try {
				localStorage.setItem(SKIPPED_KEY, release.version);
			} catch {
				/* private mode */
			}
		}
		setVisible(false);
		setStatus("idle");
	}, [release]);

	const dismiss = useCallback(() => {
		setVisible(false);
	}, []);

	const reopen = useCallback(() => {
		if (release && (status === "available" || status === "error")) {
			setVisible(true);
		}
	}, [release, status]);

	const openReleasePage = useCallback(() => {
		openExternalUrl(release?.htmlUrl ?? "");
	}, [release]);

	const openInstallSettings = useCallback(() => {
		openInstallPermissionSettings();
	}, []);

	return {
		status,
		visible,
		current,
		release,
		progress,
		error,
		needsInstallPermission,
		lastChecked,
		check,
		download,
		skip,
		dismiss,
		reopen,
		openReleasePage,
		openInstallSettings,
	};
}
