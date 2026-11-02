import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

import {
	automationPhase,
	type AutomationPhase,
} from "@/lib/automation-status";
import {
	isAndroidBridge,
	ussdAutomationEnabled,
	ussdAutomationRunning,
	type AutomationConnectionEvent,
} from "@/lib/sms-bridge";

/**
 * Live availability of the automation service. `available` is the user's
 * Accessibility switch; `running` is the system's actual service binding.
 * They disagree after Android kills or suppresses the service, which is why
 * one is never used as proof of the other.
 *
 * The service emits "common:automation" on connect and disconnect, so the UI
 * updates immediately. Focus, visibility and a single short mount check cover
 * the cases where the WebView was not listening yet. There is no retry loop.
 */
export function useAutomationAvailable() {
	const read = () => {
		if (!isAndroidBridge()) return { available: false, running: false };
		const enabled = ussdAutomationEnabled();
		return { available: enabled, running: enabled && ussdAutomationRunning() };
	};
	const [state, setState] = useState(read);
	const recheck = useCallback(() => setState(read()), []);

	useEffect(() => {
		recheck();
		// A cold start can bind the service a moment after the UI appears.
		const timer = window.setTimeout(recheck, 1200);
		const onFocus = () => recheck();
		const off = Events.On("common:automation", (ev) => {
			const data = ev.data as AutomationConnectionEvent;
			if (!data || typeof data.connected !== "boolean") {
				recheck();
				return;
			}
			setState(() => {
				const enabled = isAndroidBridge() ? ussdAutomationEnabled() : false;
				return { available: enabled, running: enabled && data.connected };
			});
		});
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onFocus);
		return () => {
			window.clearTimeout(timer);
			off();
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onFocus);
		};
	}, [recheck]);

	const phase: AutomationPhase = automationPhase(
		state.available,
		state.running,
	);
	return { ...state, phase, recheck };
}
