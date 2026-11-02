import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	AutomationDisconnectedPanel,
	AutomationOffPanel,
} from "@/components/automation-gate";
import { useAutomationAvailable } from "@/hooks/use-automation-available";
import {
	automationStatusDetail,
	automationStatusTitle,
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
 * recovery controls, battery guidance only when the service is actually
 * connected, and a copyable diagnostic report.
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
				<CardDescription>
					Connection status, recovery and troubleshooting.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{auto.phase === "connected" ? (
					<div className="space-y-1">
						<p className="text-sm font-medium">
							{automationStatusTitle(auto.phase)}
						</p>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{automationStatusDetail(auto.phase)}
						</p>
					</div>
				) : null}

				{auto.phase === "off" ? <AutomationOffPanel /> : null}
				{auto.phase === "disconnected" ? (
					<AutomationDisconnectedPanel onRetry={auto.recheck} />
				) : null}

				{auto.phase === "connected" && batteryRisks.length > 0 ? (
					<div className="space-y-2 border border-border p-3">
						<p className="text-sm font-medium">
							Battery settings may interrupt automation
						</p>
						<ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
							{batteryRisks.map((reason) => (
								<li key={reason}>{reason}</li>
							))}
						</ul>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{guidance[0]}
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
					<span className="text-xs text-muted-foreground">Diagnostics</span>
					<div className="flex gap-2">
						<Button variant="outline" size="sm" onClick={refresh}>
							Refresh
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={!diagnostics}
							onClick={() => void copyDiagnostics()}
						>
							Copy diagnostics
						</Button>
					</div>
				</div>
				{diagnostics ? (
					<p className="text-[12px] text-muted-foreground">
						{diagnostics.device.manufacturer} {diagnostics.device.model} ·
						Android {diagnostics.device.android}
					</p>
				) : (
					<p className="text-[12px] text-muted-foreground">
						Diagnostics unavailable.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
