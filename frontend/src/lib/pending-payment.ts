/**
 * A guided payment the user started inside Tripwire. The arrival receipt is
 * only automatic for a spend that lands shortly after one of these; every
 * other SMS spend merges silently and can still be inspected with a
 * long-press on its transaction row.
 *
 * Ten minutes is the window from starting the USSD session to the receipt
 * SMS. The flow itself is capped at 90 seconds, so this leaves room for a
 * slow network or a delayed delivery without turning into "any spend in the
 * next hour pops a banner".
 */
const KEY = "mpesa-analyzer.pending-payment";
const WINDOW_MS = 10 * 60 * 1000;

export interface PendingGuidedPayment {
	/** Wall-clock time the guided session started. */
	at: number;
}

export function markPendingGuidedPayment(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify({ at: Date.now() }));
	} catch {
		/* private mode: the banner simply stays manual */
	}
}

export function clearPendingGuidedPayment(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* ignore */
	}
}

/** The marker when it is still inside the receipt window, else null. */
export function peekPendingGuidedPayment(
	now = Date.now(),
): PendingGuidedPayment | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const pending = JSON.parse(raw) as PendingGuidedPayment;
		if (!pending || typeof pending.at !== "number") {
			clearPendingGuidedPayment();
			return null;
		}
		const age = now - pending.at;
		if (age < 0 || age > WINDOW_MS) {
			clearPendingGuidedPayment();
			return null;
		}
		return pending;
	} catch {
		return null;
	}
}
