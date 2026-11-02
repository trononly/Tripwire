import type * as categories from "../../bindings/mpesa-analyzer/internal/categories/models";

/**
 * Budget warnings are a state, not an event: the same 92% is still true after
 * a relaunch. Session storage remembers which category states this app session
 * has already announced, so the toast fires once and the dashboard notice
 * stays put. A state change (near -> over) is announced again.
 */
const KEY_PREFIX = "tripwire.budget-alerts.";

type AlertStore = Pick<Storage, "getItem" | "setItem">;

export function budgetAlertKey(month: string): string {
	return `${KEY_PREFIX}${month}`;
}

function readSeen(
	month: string,
	store: AlertStore,
): Record<string, string> {
	try {
		const raw = store.getItem(budgetAlertKey(month));
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}

/** The statuses whose current state has not been announced this session. */
export function unseenBudgetAlerts(
	statuses: categories.BudgetStatus[],
	month: string,
	store: AlertStore,
): categories.BudgetStatus[] {
	const seen = readSeen(month, store);
	return statuses.filter((status) => seen[status.id] !== status.state);
}

/** Record the states just announced. */
export function markBudgetAlertsSeen(
	statuses: categories.BudgetStatus[],
	month: string,
	store: AlertStore,
): void {
	try {
		const seen = readSeen(month, store);
		for (const status of statuses) seen[status.id] = status.state;
		store.setItem(budgetAlertKey(month), JSON.stringify(seen));
	} catch {
		/* private mode: the notice still shows, the toast may repeat */
	}
}
