import { useCallback, useEffect, useState } from "react";
import { vibrateIfEnabled } from "@/lib/motion-settings";

// Privacy Mode (formerly "Secrets Mode"): blurs every money figure behind a
// tap-to-reveal veil so balances stay unreadable on a shared screen. The
// setting itself persists; individual reveals are per-mount and never stored.
export const PRIVACY_MODE_KEY = "mpesa-analyzer.privacy-mode";
const PRIVACY_EVENT = "mpesa-analyzer.privacy-mode-changed";

/** Default off: the veil is opt-in, never a surprise on first launch. */
export function getPrivacyModeEnabled(): boolean {
	try {
		return localStorage.getItem(PRIVACY_MODE_KEY) === "1";
	} catch {
		/* private mode: stays session-only */
		return false;
	}
}

export function setPrivacyMode(on: boolean): void {
	try {
		localStorage.setItem(PRIVACY_MODE_KEY, on ? "1" : "0");
	} catch {
		/* private mode: stays session-only */
	}
	try {
		window.dispatchEvent(new Event(PRIVACY_EVENT));
	} catch {
		/* non-DOM: no-op */
	}
}

export function togglePrivacyMode(): void {
	setPrivacyMode(!getPrivacyModeEnabled());
}

/** Live Privacy Mode state, synced across components and tabs. */
export function usePrivacyMode(): boolean {
	const [value, setValue] = useState(getPrivacyModeEnabled);
	useEffect(() => {
		const refresh = () => setValue(getPrivacyModeEnabled());
		window.addEventListener(PRIVACY_EVENT, refresh);
		window.addEventListener("storage", refresh);
		return () => {
			window.removeEventListener(PRIVACY_EVENT, refresh);
			window.removeEventListener("storage", refresh);
		};
	}, []);
	return value;
}

/**
 * One figure's veil state. Returns whether it should currently be blurred and
 * a reveal action. Reveals are per-mount and reset whenever Privacy Mode is
 * switched off, so the next time it is enabled everything is hidden again.
 */
export function useReveal() {
	const privacy = usePrivacyMode();
	const [revealed, setRevealed] = useState(false);
	useEffect(() => {
		if (!privacy) setRevealed(false);
	}, [privacy]);
	const blurred = privacy && !revealed;
	const reveal = useCallback(() => {
		if (!blurred) return;
		vibrateIfEnabled(8);
		setRevealed(true);
	}, [blurred]);
	return { blurred, reveal, revealed };
}
