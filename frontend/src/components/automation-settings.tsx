import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	AutomationDisconnectedPanel,
	AutomationOffPanel,
} from "@/components/automation-gate";
import { useAutomationAvailable } from "@/hooks/use-automation-available";
import {
	batteryGuidance,
	batteryRiskReasons,
	formatAutomationDiagnostics,
	isXiaomiLike,
} from "@/lib/automation-status";
import {
	automationDiagnostics,
	openBatterySettings,
	type AutomationDiagnostics,
} from "@/lib/sms-bridge";

/**
 * Settings' single place for automation health: the live connection state,
 * recovery controls, battery guidance only when the service is connected, and
 * a copyable diagnostic report. The card stays quiet when everything is fine.
 */
export function AutomationSettingsCard() {
	const auto = useAutomationAvailable();
	const [diagnostics, setDiagnostics] =
		useState<AutomationDiagnostics | null>(null);

	const refresh = useCallback(() => {
		setDiagnostics(automationDiagnostics());
	}, []);

	useEffect(() => {
		refresh();
		const onFocus = () => refresh();
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onFocus);
		return () => {
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onFocus);
		};
	}, [refresh, auto.phase]);

	const batteryRisks =
		auto.phase === "connected" ? batteryRiskReasons(diagnostics) : [];
	const guidance = batteryGuidance(diagnostics);
	const xiaomi = isXiaomiLike(diagnostics);

	async function copyDiagnostics() {
		try {
			await navigator.clipboard.writeText(
				formatAutomationDiagnostics(diagnostics),
			);
			toast.success("Automation diagnostics copied");
		} catch {
			toast.error("Could not copy diagnostics");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>M-Pesa automation</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{auto.phase === "connected" ? (
					<div className="space-y-1">
						<p className="text-sm font-medium">Connected</p>
						<p className="text-xs leading-relaxed text-muted-foreground">
							Tripwire can fill the M-Pesa menus; your PIN stays in the phone
							dialog.
						</p>
					</div>
				) : null}

				{auto.phase === "off" ? <AutomationOffPanel /> : null}
				{auto.phase === "disconnected" ? (
					<AutomationDisconnectedPanel onRetry={auto.recheck} />
				) : null}

				{auto.phase === "connected" && batteryRisks.length > 0 ? (
					<div className="space-y-2 bg-muted/40 p-3">
						<p className="text-sm font-medium">
							Battery settings can pause automation
						</p>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{batteryRisks.join(" ")} {guidance[0]}
						</p>
						{xiaomi && guidance[1] ? (
							<p className="text-xs leading-relaxed text-muted-foreground">
								{guidance[1]}
							</p>
						) : null}
						<Button variant="outline" size="sm" onClick={openBatterySettings}>
							Open battery settings
						</Button>
					</div>
				) : null}

				<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
					<span className="text-xs text-muted-foreground">
						{diagnostics ? "Diagnostics" : "Diagnostics unavailable"}
					</span>
					<Button
						variant="ghost"
						size="sm"
						disabled={!diagnostics}
						onClick={() => void copyDiagnostics()}
					>
						Copy diagnostics
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
