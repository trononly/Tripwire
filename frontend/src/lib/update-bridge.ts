// Typed access to the Android in-app-update bridge (WailsBridge.java update
// section, exposed via WailsJSBridge.java). Everything guards for absence:
// desktop builds and old APKs have no such methods, so the updater degrades
// to "no updates available" instead of crashing.

/** Installed app identity, from the native package manager. */
export interface AppVersion {
	versionName: string;
	versionCode: number;
	packageName: string;
}

/** One "common:update" event payload from the native downloader. */
export interface UpdateBridgeEvent {
	state: "downloading" | "ready" | "error";
	received?: number;
	total?: number;
	error?: string;
}

/** True when the injected Android bridge exposes the updater methods. */
export function isUpdateBridge(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.wails?.getAppVersion === "function"
	);
}

/** Installed version, or null off-Android / on builds without the bridge. */
export function getInstalledVersion(): AppVersion | null {
	try {
		const raw = window.wails?.getAppVersion?.();
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const v = parsed as Partial<AppVersion>;
		if (typeof v.versionName !== "string" || v.versionName === "")
			return null;
		return {
			versionName: v.versionName,
			versionCode: typeof v.versionCode === "number" ? v.versionCode : 0,
			packageName: typeof v.packageName === "string" ? v.packageName : "",
		};
	} catch {
		return null;
	}
}

/** Whether the system will currently let us trigger an APK install. */
export function canInstallPackages(): boolean {
	try {
		return window.wails?.canInstallPackages?.() ?? false;
	} catch {
		return false;
	}
}

/** Deep-link the user to the "Install unknown apps" toggle for this app. */
export function openInstallPermissionSettings(): void {
	try {
		window.wails?.openInstallPermissionSettings?.();
	} catch {
		/* ignore */
	}
}

/** Download an APK and hand it to the system installer (never blocks). */
export function downloadAndInstallApk(url: string, fileName: string): void {
	window.wails?.downloadAndInstallApk?.(url, fileName);
}

/** Open a URL in the system browser. Falls back to window.open off-bridge. */
export function openExternalUrl(url: string): void {
	try {
		if (window.wails?.openUrl) {
			window.wails.openUrl(url);
			return;
		}
	} catch {
		/* fall through */
	}
	window.open(url, "_blank", "noopener,noreferrer");
}
