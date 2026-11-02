import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { interruptedCopy } from "@/lib/automation-status";
import { isAndroidBridge, openUssdAutomationSettings } from "@/lib/sms-bridge";

/** Automation is switched off in Android Accessibility settings. */
export function AutomationOffPanel() {
	if (!isAndroidBridge()) {
		return (
			<p className="text-sm text-muted-foreground">
				Guided M-Pesa payments are available in the Android app.
			</p>
		);
	}
	return (
		<div
			role="alert"
			className="space-y-3 border border-amber-500/40 bg-amber-500/10 p-4"
		>
			<div className="flex items-start gap-2">
				<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<div>
					<p className="text-sm font-medium">Automation is off</p>
					<p className="text-xs text-muted-foreground">
						Enable it in Android Accessibility settings so Tripwire can fill
						the M-Pesa menus. Your PIN still stays in the phone dialog.
					</p>
				</div>
			</div>
			<Button onClick={openUssdAutomationSettings}>Enable automation</Button>
		</div>
	);
}

/**
 * The switch is on but Android has not bound the service. This is the state
 * that can be caused by a stale binding, an OEM process limit, or another
 * tool controlling the screen. The copy does not claim a cause.
 */
export function AutomationDisconnectedPanel({
	onRetry,
	compact = false,
}: {
	onRetry: () => void;
	compact?: boolean;
}) {
	return (
		<div
			role="alert"
			className={
				compact
					? "space-y-2.5 border border-amber-500/40 bg-amber-500/10 p-3"
					: "space-y-3 border border-amber-500/40 bg-amber-500/10 p-4"
			}
		>
			<div className="flex items-start gap-2.5">
				<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<div className="space-y-1">
					<p className="text-sm font-medium">
						Automation is enabled, but not connected
					</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						Android hasn&rsquo;t connected the automation service. Another
						app or system tool controlling your screen may be interfering.
					</p>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button size="sm" onClick={onRetry}>
					Retry connection
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={openUssdAutomationSettings}
				>
					Open Accessibility settings
				</Button>
			</div>
			<details className="text-xs text-muted-foreground">
				<summary className="cursor-pointer select-none">
					Still not connected?
				</summary>
				<div className="mt-2 space-y-1.5">
					<p>
						Turn Tripwire off and on in Accessibility settings, then return
						here. If that doesn&rsquo;t help, restart the phone.
					</p>
					<p>
						Close any app that is controlling or recording your screen before
						trying again.
					</p>
				</div>
			</details>
		</div>
	);
}

/**
 * Shown after a guided run was cut short. It never claims the payment failed;
 * the user is asked to verify before trying again.
 */
export function AutomationInterruptedNotice({
	code,
	onDismiss,
}: {
	code?: string;
	onDismiss: () => void;
}) {
	const copy = interruptedCopy(code);
	return (
		<div
			role="alert"
			className="space-y-2 border border-amber-500/40 bg-amber-500/10 p-3"
		>
			<div className="flex items-start gap-2.5">
				<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<div className="space-y-1">
					<p className="text-sm font-medium">{copy.title}</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{copy.body}
					</p>
				</div>
			</div>
			<Button variant="outline" size="sm" onClick={onDismiss}>
				Dismiss
			</Button>
		</div>
	);
}
