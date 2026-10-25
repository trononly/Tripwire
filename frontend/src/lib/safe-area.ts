// Android WebView safe-area insets. `env(safe-area-inset-*)` is not reliable
// across Android versions, especially with targetSdk 35 forcing edge-to-edge,
// so the native bridge reports the real system-bar heights and we copy them
// into CSS variables. Desktop builds and older APKs keep the env() fallback.

export interface SafeAreaInsets {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

const KEYS = ["top", "bottom", "left", "right"] as const;

function px(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.round(value)
		: 0;
}

/** Parse the bridge's {"top","bottom","left","right"} payload. */
export function parseSafeArea(raw: string | null | undefined): SafeAreaInsets | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const source = parsed as Record<string, unknown>;
		const out = {} as SafeAreaInsets;
		for (const key of KEYS) out[key] = px(source[key]);
		return out;
	} catch {
		return null;
	}
}

/** Copy insets into the root CSS variables consumed by the layout. */
export function applySafeArea(
	insets: SafeAreaInsets,
	root: HTMLElement = document.documentElement,
): void {
	for (const key of KEYS) {
		root.style.setProperty(`--safe-${key}`, `${insets[key]}px`);
	}
}

/** Read the native bridge, or null off-Android / on old APKs. */
export function readSafeArea(): SafeAreaInsets | null {
	try {
		return parseSafeArea(window.wails?.getSafeArea?.());
	} catch {
		return null;
	}
}
