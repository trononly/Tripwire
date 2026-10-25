import { useEffect, useRef } from "react";

/**
 * Android's system back button calls MainActivity.onBackPressed. That asks
 * this module first: if a dialog/drawer is open it closes the top one and
 * returns true, so the WebView never pops the route. Without this, back closed
 * the modal and navigated the page at the same time.
 */

interface ModalEntry {
	close: () => void;
}

const entries: ModalEntry[] = [];

declare global {
	interface Window {
		__tripwireHandleBack?: () => boolean;
	}
}

function handleBack(): boolean {
	const top = entries[entries.length - 1];
	if (!top) return false;
	top.close();
	return true;
}

if (typeof window !== "undefined") {
	window.__tripwireHandleBack = handleBack;
}

export function useModalBack(open: boolean, close: () => void): void {
	const closeRef = useRef(close);
	useEffect(() => {
		closeRef.current = close;
	}, [close]);

	useEffect(() => {
		if (!open) return;
		const entry: ModalEntry = { close: () => closeRef.current() };
		entries.push(entry);
		return () => {
			const index = entries.indexOf(entry);
			if (index !== -1) entries.splice(index, 1);
		};
	}, [open]);
}
