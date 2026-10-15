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
	// In-app updates (WailsBridge.java update section). All optional so
	// desktop and older builds degrade gracefully.
	getAppVersion?(): string;
	canInstallPackages?(): boolean;
	openInstallPermissionSettings?(): void;
	downloadAndInstallApk?(url: string, fileName: string): void;
	openUrl?(url: string): void;
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

/**
 * The three runtime permissions the M-Pesa features rely on, each with a
 * distinct job — the whole point of keeping them apart:
 *
 *   read    READ_SMS    read the historical inbox (manual/full import)
 *   receive RECEIVE_SMS the always-on catcher can queue new confirmations
 *   call    CALL_PHONE  the app can place the *334# USSD call
 *
 * A device can hold any combination. Treating "SMS permission" as one flag
 * is what let the catcher queue go undrained while READ_SMS was missing.
 */
export interface SmsPermissions {
	read: boolean;
	receive: boolean;
	call: boolean;
}

const NO_PERMISSIONS: SmsPermissions = { read: false, receive: false, call: false };

/** Current grant state for every SMS-related permission. All false off-Android. */
export function smsPermissions(): SmsPermissions {
	if (!isAndroidBridge()) return NO_PERMISSIONS;
	return {
		read: window.wails?.hasSmsPermission?.() ?? false,
		receive: window.wails?.hasSmsReceivePermission?.() ?? false,
		call: window.wails?.hasCallPermission?.() ?? false,
	};
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

/** Start a permission-gated inbox read; the result arrives as "common:sms". */
export function requestSmsImport(): void {
	window.wails?.getSms?.();
}
