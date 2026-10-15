import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

export function PageFallback() {
	return (
		<div className="flex h-[50vh] items-center justify-center text-muted-foreground">
			Loading dashboard…
		</div>
	);
}

// Primary bottom-tab destinations vs. secondary pages. There is no native
// back-press hook in this app (main.go is the desktop Wails entry,
// build/android/main_android.go only registers it - no onBackPressed /
// goBack handling anywhere), so the Android system back button arrives as
// a plain WebView history back, i.e. a router POP navigation. This
// component reroutes exactly that: a POP landing on a secondary route is
// replaced with the last-visited primary tab, instead of stepping back
// through history. POP on a primary tab is untouched,
// so it keeps the default behavior (exit the app when history is empty).
// In-app PUSH/REPLACE navigations (tab taps, links, FAB) are unaffected.
const PRIMARY_TABS: readonly string[] = ["/", "/transactions", "/insights"];

export function BackToPrimaryTabs() {
	const location = useLocation();
	const navigate = useNavigate();
	const navigationType = useNavigationType();
	const lastPrimary = useRef<string>("/");
	useEffect(() => {
		if (PRIMARY_TABS.includes(location.pathname)) {
			lastPrimary.current = location.pathname;
			return;
		}
		// A system-back POP landing on a secondary route is rerouted to the
		// last-visited primary tab (replace, so history doesn't grow).
		// In-app PUSH/REPLACE navigations never trigger this.
		if (navigationType === "POP" && location.pathname !== lastPrimary.current) {
			navigate(lastPrimary.current, { replace: true });
		}
	}, [location.pathname, navigationType, navigate]);
	return null;
}
