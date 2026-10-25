// Typed access to the Android SMS bridge injected by WailsJSBridge.java.
// Desktop builds have no such interface, so everything here guards for its
// absence - callers never reach into window.wails directly.

interface WailsAndroidBridge {
	platform?(): string;
	isDebug?(): boolean;
	hasSmsPermission?(): boolean;
	getSms?(): void;
	hasCallPermission?(): boolean;
	hasPhoneStatePermission?(): boolean;
	getSimCards?(): string;
	requestPhoneStatePermission?(): void;
	startUssdSession?(code: string): void;
	isUssdAutomationEnabled?(): boolean;
	openUssdAutomationSettings?(): void;
	startUssdQuickEntry?(scriptJson: string): void;
	drainPendingSms?(): string;
	hasSmsReceivePermission?(): boolean;
	// In-app updates (WailsBridge.java update section). All optional so
	// desktop and older builds degrade gracefully.
	getAppVersion?(): string;
	canInstallPackages?(): boolean;
	openInstallPermissionSettings?(): void;
	openAppSettings?(): void;
	downloadAndInstallApk?(url: string, fileName: string): void;
	openUrl?(url: string): void;
	openURL?(url: string): void;
	pickContact?(): void;
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
	// Which SIM received the message. Optional: older bridge builds and
	// desktop sources omit them, and the bridge sends -1/"" when Android
	// could not resolve the subscription. The body is identical on every
	// SIM, so these are the only way to tell the wallets apart.
	subId?: number;
	slot?: number;
	simLabel?: string;
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
 * distinct job - the whole point of keeping them apart:
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

/** Progress events from the automation service (common:ussd-auto). */
export interface UssdAutoEvent {
	state: "step" | "awaiting-pin" | "complete" | "aborted";
	kind?: string;
	step?: number;
	steps?: number;
	reason?: string;
}

/** True when the automation service is enabled in system Settings. */
export function ussdAutomationEnabled(): boolean {
	if (!isAndroidBridge()) return false;
	return window.wails?.isUssdAutomationEnabled?.() ?? false;
}

/** Open system Settings at the accessibility page (user opts in there). */
export function openUssdAutomationSettings(): void {
	window.wails?.openUssdAutomationSettings?.();
}

/**
 * Start a guided payment: the service fills the *334# menus from the script
 * and stops at the PIN screen. Progress arrives as common:ussd-auto.
 */
export function startUssdQuickEntry(script: {
	version: 1;
	kind: string;
	timeoutSec: number;
	steps: { match: string[]; input: string }[];
}): void {
	window.wails?.startUssdQuickEntry?.(JSON.stringify(script));
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

/** One SIM as currently seen by the phone (see WailsBridge.getSimCards). */
export interface SimCard {
	subId: number;
	slot: number;
	simLabel: string;
	/** Phone number, when the SIM reports one. Shown as subtext, never parsed. */
	number: string;
}

/**
 * True when carrier names can be resolved right now. Read-only: the only
 * prompt for it is the Settings "Show SIM names" opt-in - import never asks.
 */
export function hasPhoneStatePermission(): boolean {
	if (!isAndroidBridge()) return false;
	return window.wails?.hasPhoneStatePermission?.() ?? false;
}

/**
 * The phone's current SIM list. Never prompts; entries carry empty
 * labels/numbers when they cannot be resolved.
 */
export function requestSimCards(): SimCard[] {
	try {
		const raw = window.wails?.getSimCards?.();
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return (parsed as Partial<SimCard>[]).map((c) => ({
			subId: typeof c.subId === "number" ? c.subId : -1,
			slot: typeof c.slot === "number" ? c.slot : -1,
			simLabel: typeof c.simLabel === "string" ? c.simLabel : "",
			number: typeof c.number === "string" ? c.number : "",
		}));
	} catch {
		return [];
	}
}

/**
 * Ask for phone-state access (SIM names/numbers) on demand. The outcome
 * arrives as a "common:simstate" event {granted}. Call only from an
 * explicit tap - never at import, never at launch.
 */
export function requestPhoneStatePermission(): void {
	window.wails?.requestPhoneStatePermission?.();
}

/**
 * Open the system App info page for this app (Settings → Apps → Tripwire)
 * so the user can allow restricted settings and grant SMS access, then
 * come back and retry. No-op off-Android.
 */
export function openAppSettings(): void {
	try {
		window.wails?.openAppSettings?.();
	} catch {
		/* ignore */
	}
}

/** The "common:contact" event payload from WailsBridge.java. */
export interface ContactPickResult {
	ok?: boolean;
	name?: string;
	phone?: string;
	error?: string;
	cancelled?: boolean;
}

/**
 * True when this build can open the Android system contact picker. The
 * picker needs no contacts permission: ACTION_PICK returns a one-off URI
 * for the row the user tapped. Desktop degrades to manual entry.
 */
export function canPickContact(): boolean {
	return isAndroidBridge() && window.wails?.pickContact !== undefined;
}

/**
 * Open the system contact picker; the result arrives as a "common:contact"
 * event. No-op off-Android - callers should check canPickContact first.
 */
export function pickContact(): void {
	try {
		window.wails?.pickContact?.();
	} catch {
		/* ignore */
	}
}
