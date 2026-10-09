import { useCallback, useEffect, useState } from "react";

import { smsPermissions, type SmsPermissions } from "@/lib/sms-bridge";

/**
 * Live snapshot of this device's SMS-related permissions. Permissions can
 * only change while a system dialog or Android Settings is in front of the
 * app, so refreshing on mount, on return to foreground and on demand covers
 * every path. Desktop resolves to the all-false state and never re-renders.
 */
export function useSmsPermissions(): {
	permissions: SmsPermissions;
	refresh: () => void;
} {
	const [permissions, setPermissions] = useState<SmsPermissions>(smsPermissions);
	const refresh = useCallback(() => setPermissions(smsPermissions()), []);

	useEffect(() => {
		refresh();
		const onVisible = () => {
			if (document.visibilityState === "visible") refresh();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, [refresh]);

	return { permissions, refresh };
}
