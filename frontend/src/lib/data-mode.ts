import { isAndroidBridge } from "@/lib/sms-bridge";

/**
 * Data mode, meaningful on Android only: the analysis runs over either the
 * statement history or the SMS imports. Chosen in Settings; SMS imports
 * switch it automatically.
 */
export type DataMode = "statements" | "sms";

export const MODE_KEY = "mpesa-analyzer.mode";

/**
 * Initial mode: Android opens on SMS (the source a phone actually has)
 * unless the user last picked Statements; desktop is always statements.
 */
export function loadInitialMode(): DataMode {
	try {
		if (!isAndroidBridge()) return "statements";
		return localStorage.getItem(MODE_KEY) === "statements"
			? "statements"
			: "sms";
	} catch {
		return "sms";
	}
}

/** Persist an explicit mode choice; session-only in private mode. */
export function saveMode(mode: DataMode): void {
	try {
		localStorage.setItem(MODE_KEY, mode);
	} catch {
		/* private mode: mode stays session-only */
	}
}
