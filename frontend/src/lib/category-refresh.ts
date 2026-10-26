import { useSyncExternalStore } from "react";

// A tiny app-wide revision counter for user-category edits. Category
// assignments are resolved in Go at read time, so components that cache a
// prepared dataset (the transaction list hook) need a nudge to ask again after
// a rule changes. A version counter avoids threading a callback through every
// page, and keeps the dashboard's future category view in sync too.
let version = 0;
const listeners = new Set<() => void>();

/** Call after any category or assignment change. */
export function bumpCategories(): void {
	version += 1;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Re-renders the caller whenever categories or assignments change. */
export function useCategoryVersion(): number {
	return useSyncExternalStore(
		subscribe,
		() => version,
		() => 0,
	);
}
