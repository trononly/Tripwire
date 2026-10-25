import { useEffect } from "react";

import { applySafeArea, readSafeArea } from "@/lib/safe-area";

/**
 * Publish the native Android system-bar insets as `--safe-top/bottom/left/right`.
 * The bridge is re-read on resize and rotation because the navigation bar can
 * change height (gesture vs three-button) while the app is running.
 */
export function useSafeAreaInsets(): void {
	useEffect(() => {
		const apply = () => {
			const insets = readSafeArea();
			if (insets) applySafeArea(insets);
		};

		apply();
		window.addEventListener("resize", apply);
		window.addEventListener("orientationchange", apply);
		window.visualViewport?.addEventListener("resize", apply);
		return () => {
			window.removeEventListener("resize", apply);
			window.removeEventListener("orientationchange", apply);
			window.visualViewport?.removeEventListener("resize", apply);
		};
	}, []);
}
