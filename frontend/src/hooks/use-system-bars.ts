import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Keep the Android status/navigation bars in step with the in-app Light/Dark
 * setting. The native theme only knows the system mode, so without this a
 * manually chosen theme left a light-gray bar under a dark app (or vice
 * versa). Old APKs and desktop builds simply ignore the bridge call.
 */
export function useSystemBars(): void {
	const { resolvedTheme } = useTheme();
	useEffect(() => {
		if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
		window.wails?.setSystemBars?.(
			JSON.stringify({ dark: resolvedTheme === "dark" }),
		);
	}, [resolvedTheme]);
}
