// Typed access to the Android SMS bridge injected by WailsJSBridge.java.
// Desktop builds have no such interface, so everything here guards for its
// absence — callers never reach into window.wails directly.

interface WailsAndroidBridge {
	platform?(): string;
	isDebug?(): boolean;
	hasSmsPermission?(): boolean;
	getSms?(): void;
}

declare global {
	interface Window {
		wails?: WailsAndroidBridge;
	}
}

/** One raw SMS record, shaped exactly like the Phase 3 bridge event. */
export interface SmsBridgeMessage {
	id: string;
	address: string;
	dateMs: number;
	body: string;
}

/** The "common:sms" event payload from WailsBridge.java. */
export interface SmsBridgeResult {
	ok: boolean;
	count?: number;
	skipped?: number;
	messages?: SmsBridgeMessage[];
	error?: string;
}

/** True only when the injected Android bridge with the SMS methods exists. */
export function isAndroidBridge(): boolean {
	return (
		typeof window !== "undefined" &&
		window.wails?.hasSmsPermission !== undefined &&
		window.wails?.getSms !== undefined &&
		window.wails?.platform?.() === "android"
	);
}

/** Permission check without prompting. False when the bridge is missing. */
export function hasSmsPermission(): boolean {
	return isAndroidBridge() && (window.wails?.hasSmsPermission?.() ?? false);
}

/** Start a permission-gated inbox read; the result arrives as "common:sms". */
export function requestSmsImport(): void {
	window.wails?.getSms?.();
}
