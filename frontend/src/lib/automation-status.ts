import type { AutomationDiagnostics } from "./sms-bridge";

/** The three states the UI needs to tell apart. */
export type AutomationPhase = "off" | "disconnected" | "connected";

export function automationPhase(
	enabled: boolean,
	connected: boolean,
): AutomationPhase {
	if (!enabled) return "off";
	return connected ? "connected" : "disconnected";
}

export function automationStatusTitle(phase: AutomationPhase): string {
	switch (phase) {
		case "connected":
			return "Automation is connected";
		case "disconnected":
			return "Automation is enabled, but not connected";
		default:
			return "Automation is off";
	}
}

export function automationStatusDetail(phase: AutomationPhase): string {
	switch (phase) {
		case "connected":
			return "Tripwire can fill the M-Pesa menus for you. Your PIN always stays in the phone dialog.";
		case "disconnected":
			return "Android hasn't connected the automation service. Another app or system tool controlling your screen may be interfering.";
		default:
			return "Enable Tripwire M-Pesa automation in Android Accessibility settings.";
	}
}

/** True for Xiaomi/Redmi/POCO or a HyperOS/MIUI build. */
export function isXiaomiLike(
	diagnostics: AutomationDiagnostics | null,
): boolean {
	if (!diagnostics) return false;
	const device = diagnostics.device;
	const value =
		`${device.manufacturer} ${device.brand} ${device.os}`.toLowerCase();
	return /xiaomi|redmi|poco|hyperos|miui/.test(value);
}

/** Battery conditions that can pause a guided USSD session. */
export function batteryRiskReasons(
	diagnostics: AutomationDiagnostics | null,
): string[] {
	if (!diagnostics) return [];
	const reasons: string[] = [];
	const power = diagnostics.power;
	if (power.ignoringBatteryOptimizations === false) {
		reasons.push("Battery optimization is on for Tripwire.");
	}
	if (power.backgroundRestricted) {
		reasons.push("Background activity is restricted for Tripwire.");
	}
	if (power.powerSaveMode) {
		reasons.push("Battery saver is on.");
	}
	return reasons;
}

/**
 * Practical steps, generic first. HyperOS-only instructions are not shown to
 * other Android users; they appear only when the device really is Xiaomi-like.
 */
export function batteryGuidance(
	diagnostics: AutomationDiagnostics | null,
): string[] {
	const steps = [
		"Open Android battery settings for Tripwire and allow unrestricted background activity.",
	];
	if (isXiaomiLike(diagnostics)) {
		steps.push(
			"On HyperOS, also allow Autostart for Tripwire and set its battery saver to No restrictions.",
		);
	}
	return steps;
}

/**
 * Whether a new guided run may start. A run in flight (or an active session
 * that has not reported a terminal state) must never be replaced: a second
 * dial could duplicate a payment.
 */
export function canStartQuickEntry(status: string, active: boolean): boolean {
	if (active) return false;
	return !(
		status === "starting" ||
		status === "step" ||
		status === "awaiting-pin" ||
		status === "awaiting-confirm"
	);
}

/**
 * Codes that mean the run did not finish normally. They all require the user
 * to verify the transaction before an explicit retry.
 */
export function isInterruptionCode(code?: string | null): boolean {
	return (
		code === "accessibility-disconnected" ||
		code === "accessibility-reconnected" ||
		code === "automation-disconnected" ||
		code === "timeout"
	);
}

/**
 * Safety copy for an interrupted or incomplete run. Never says a payment
 * failed, and never invites an automatic retry.
 */
export function interruptedCopy(code?: string): {
	title: string;
	body: string;
} {
	switch (code) {
		case "accessibility-disconnected":
		case "accessibility-reconnected":
		case "automation-disconnected":
			return {
				title: "Automation was interrupted",
				body: "Check your M-Pesa transaction status before attempting the payment again.",
			};
		case "timeout":
			return {
				title: "Automation stopped",
				body: "The menu took too long. Check your M-Pesa transaction status before attempting the payment again.",
			};
		case "outcome-unknown":
		case "app-returned":
			return {
				title: "Payment outcome unknown",
				body: "Tripwire did not see the menu finish. Check your M-Pesa messages before attempting the payment again.",
			};
		default:
			return {
				title: "Payment stopped",
				body: "If you are not sure whether it went through, check your M-Pesa messages before trying again.",
			};
	}
}

function when(ms: number | undefined): string {
	return ms && ms > 0 ? new Date(ms).toLocaleString("en-GB") : "never";
}

function flag(value: boolean | undefined, on: string, off: string): string {
	if (value === undefined) return "unknown";
	return value ? on : off;
}

/**
 * Plain-text diagnostics for the clipboard. Deliberately excludes PINs,
 * USSD contents, phone numbers and payment details.
 */
export function formatAutomationDiagnostics(
	diagnostics: AutomationDiagnostics | null,
): string {
	if (!diagnostics) return "Tripwire automation diagnostics\nUnavailable.";
	const d = diagnostics.device;
	const a = diagnostics.accessibility;
	const p = diagnostics.power;
	return [
		"Tripwire automation diagnostics",
		`Generated: ${when(diagnostics.at)}`,
		"",
		`Device: ${d.manufacturer} ${d.model} (${d.brand})`,
		`Android: ${d.android} (SDK ${d.sdk})`,
		`Build: ${d.os}`,
		"",
		`Accessibility enabled: ${a.enabled ? "yes" : "no"}`,
		`Service connected: ${a.connected ? "yes" : "no"}`,
		`Expected service: ${a.expected}`,
		`Last connected: ${when(a.lastConnectedAt)}`,
		`Last disconnected: ${when(a.lastDisconnectedAt)}`,
		`Last interrupted: ${when(a.lastInterruptedAt)}`,
		`Last reason: ${a.lastReason || "none"}`,
		`Automation armed: ${a.armed ? "yes" : "no"}`,
		"",
		`Battery optimization exempt: ${flag(
			p.ignoringBatteryOptimizations,
			"yes",
			"no",
		)}`,
		`Battery saver: ${flag(p.powerSaveMode, "on", "off")}`,
		`Background activity restricted: ${flag(
			p.backgroundRestricted,
			"yes",
			"no",
		)}`,
	].join("\n");
}
