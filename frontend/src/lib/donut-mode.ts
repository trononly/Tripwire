import { useCallback, useState } from "react";

// Which breakdown the dashboard's "Where the money went" card draws. The
// built-in M-Pesa categories are the default: they are what the app can
// explain for every transaction, labelled or not. The user's own categories
// are one tap away and remembered once chosen.
export type DonutMode = "mpesa" | "custom";

export const DONUT_MODE_KEY = "mpesa-analyzer.donut-mode";

export function getDonutMode(): DonutMode {
	try {
		return localStorage.getItem(DONUT_MODE_KEY) === "custom"
			? "custom"
			: "mpesa";
	} catch {
		/* private mode: stays session-only */
		return "mpesa";
	}
}

export function setDonutMode(mode: DonutMode): void {
	try {
		localStorage.setItem(DONUT_MODE_KEY, mode);
	} catch {
		/* private mode: stays session-only */
	}
}

/** The remembered donut view plus a setter that persists it. */
export function useDonutMode(): [DonutMode, (mode: DonutMode) => void] {
	const [mode, setMode] = useState<DonutMode>(getDonutMode);
	const update = useCallback((next: DonutMode) => {
		setMode(next);
		setDonutMode(next);
	}, []);
	return [mode, update];
}
