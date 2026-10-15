import { useState, type Dispatch, type SetStateAction } from "react";
import { Events } from "@wailsio/runtime";

import { ListStatements, RefreshSimLabels } from "../../bindings/mpesa-analyzer/parseservice";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import {
	hasPhoneStatePermission,
	isAndroidBridge,
	requestPhoneStatePermission,
	requestSimCards,
} from "@/lib/sms-bridge";

/**
 * SIM display names and numbers. Carrier names resolve only when
 * phone-state access is already granted - read-only unless granted: the
 * only prompts are the import-time batch and the Settings opt-in.
 */
export function useSimNames(deps: {
	setStatements: Dispatch<SetStateAction<store.StatementMeta[]>>;
	refreshPerms: () => void;
}) {
	const { setStatements, refreshPerms } = deps;
	const SIM_NUMBERS_KEY = "mpesa-analyzer.sim-numbers";
	const [simNumbers, setSimNumbers] = useState<Record<string, string>>(() => {
		try {
			const raw = localStorage.getItem(SIM_NUMBERS_KEY);
			const parsed: unknown = raw ? JSON.parse(raw) : null;
			if (parsed && typeof parsed === "object") {
				const out: Record<string, string> = {};
				for (const [k, v] of Object.entries(
					parsed as Record<string, unknown>,
				)) {
					if (typeof v === "string" && v) out[k] = v;
				}
				return out;
			}
		} catch {
			/* private mode: numbers stay session-only */
		}
		return {};
	});

	// Numbers ride under both keys (slot and subscription id) so a wallet
	// shows its number however it was keyed when imported.
	function rememberSimNumbers(
		cards: { subId: number; slot: number; number: string }[],
	) {
		const next: Record<string, string> = {};
		for (const c of cards) {
			const num = c.number.trim();
			if (!num) continue;
			if (c.slot >= 0) next[`sim-${c.slot}`] = num;
			if (c.subId >= 0) next[`sub-${c.subId}`] = num;
		}
		if (Object.keys(next).length === 0) return;
		setSimNumbers((prev) => {
			const merged = { ...prev, ...next };
			try {
				localStorage.setItem(SIM_NUMBERS_KEY, JSON.stringify(merged));
			} catch {
				/* private mode: numbers stay session-only */
			}
			return merged;
		});
	}

	// Carrier-name upgrade, run when Settings opens: resolve the phone's
	// current SIM list and heal wallets imported without phone-state
	// access - renaming fallbacks and moving subscription-keyed records
	// onto their slot key.
	function refreshSimNames() {
		if (!isAndroidBridge() || !hasPhoneStatePermission()) return;
		const cards = requestSimCards();
		rememberSimNumbers(cards);
		const named = cards.filter((c) => c.simLabel.trim() !== "");
		if (named.length === 0) return;
		RefreshSimLabels(named)
			.then((n) => {
				if (n > 0) {
					ListStatements()
					.then((list) => setStatements(list ?? []))
					.catch((e) => console.error("Reloading statements failed:", e));
				}
			})
			.catch((e) => console.error("Refreshing SIM names failed:", e));
	}

	// Settings opt-in for installs that denied the phone-state half of the
	// import prompt: ask once on tap, then resolve names when granted.
	function requestSimNamesGrant() {
		if (!isAndroidBridge()) return;
		Events.Once("common:simstate", (ev) => {
			const data = ev.data as { granted?: boolean };
			if (data?.granted) {
				refreshPerms();
				refreshSimNames();
			}
		});
		requestPhoneStatePermission();
	}

	return { simNumbers, refreshSimNames, requestSimNamesGrant };
}
