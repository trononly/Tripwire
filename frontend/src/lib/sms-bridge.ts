// Typed access to the Android SMS bridge injected by WailsJSBridge.java.
// Desktop builds have no such interface, so everything here guards for its
// absence — callers never reach into window.wails directly.

interface WailsAndroidBridge {
	platform?(): string;
	isDebug?(): boolean;
	hasSmsPermission?(): boolean;
	getSms?(): void;
	hasCallPermission?(): boolean;
	startUssdSession?(code: string): void;
	drainPendingSms?(): string;
	hasSmsReceivePermission?(): boolean;
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

declare global {
	/**
	 * Foreground hook the native side calls on every Activity resume
	 * (wired in App). Exists because `visibilitychange` is unreliable in
	 * this WebView: cold start and pull-to-refresh both bypass it, which
	 * is exactly why only those two paths ever delivered.
	 */
	// eslint-disable-next-line no-var
	var __mpesaOnForeground: (() => void) | undefined;
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

/** Start a payment session: USSD call plus confirmation listening. */
export function startUssdSession(code: string): void {
	window.wails?.startUssdSession?.(code);
}

/** Read and clear messages the catcher queued since the last drain. */
export function drainPendingSms(): SmsBridgeMessage[] {
	try {
		const raw = window.wails?.drainPendingSms?.();
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as SmsBridgeMessage[]) : [];
	} catch {
		return [];
	}
}

/** RECEIVE_SMS check without prompting. False when the bridge is missing. */
export function hasSmsReceivePermission(): boolean {
	return (
		isAndroidBridge() && (window.wails?.hasSmsReceivePermission?.() ?? false)
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
