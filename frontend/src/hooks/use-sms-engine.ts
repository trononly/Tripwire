import { useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";

import { ActivateStatement, RefreshSmsImport } from "../../bindings/mpesa-analyzer/parseservice";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import type {
	SmsImportResult,
	SmsRefreshResult,
} from "../../bindings/mpesa-analyzer/models";
import {
	drainPendingSms,
	isAndroidBridge,
	requestSmsImport,
	smsPermissions,
	type SmsBridgeMessage,
	type SmsBridgeResult,
} from "@/lib/sms-bridge";
import { MODE_KEY } from "@/lib/data-mode";

/**
 * The whole SMS side: inbox import, the catcher-queue realtime engine, the
 * per-SIM wallet records, the arrival receipt, and the restricted-settings
 * guide state. SMS import is Android-only; the injected bridge is checked
 * before every path so desktop rendering never touches window.wails.
 */
export function useSmsEngine(deps: {
	statements: store.StatementMeta[];
	upsertMeta: (record: store.StatementRecord) => void;
	refreshPerms: () => void;
	/** Move the app into SMS mode (persists the choice). */
	enterSmsMode: () => void;
}) {
	const { statements, upsertMeta, refreshPerms, enterSmsMode } = deps;
	const [smsTxs, setSmsTxs] = useState<parser.Transaction[]>([]);
	// The SMS record currently feeding SMS mode. The ref mirrors it for the
	// long-lived interval/silent-refresh closures, which capture the initial
	// render and would otherwise always see a null active record.
	const [smsRecordId, setSmsRecordId] = useState<string | null>(null);
	const smsRecordIdRef = useRef<string | null>(null);
	smsRecordIdRef.current = smsRecordId;
	// Last SMS audit of this session, kept here so the SMS page survives
	// closing the import dialog and navigating around. Not persisted.
	const [smsResult, setSmsResult] = useState<SmsImportResult | null>(null);
	const [smsBridgeCount, setSmsBridgeCount] = useState<number | null>(null);
	// Direct import, no modal: the header/SMS/Dashboard buttons call
	// startSmsImport, the bridge asks for SMS access itself when missing, and
	// the pages show skeletons until the merged dataset lands. Denials
	// surface as toasts - the permanently-denied case opens the guide.
	const [smsImporting, setSmsImporting] = useState(false);
	const smsImportingRef = useRef(false);
	const [isAndroid, setIsAndroid] = useState(false);
	// Step-by-step setup when SMS access is blocked behind Android's
	// "restricted settings" (sideloaded installs). Replaces the toast for
	// the permanently-denied case: the fix needs taps in system settings,
	// then the app re-asks in-app via onRetry.
	const [guideOpen, setGuideOpen] = useState(false);
	// Arrival receipt: the current fresh transaction, shown as a slip until
	// dismissed. Null means closed.
	const [receiptTx, setReceiptTx] = useState<parser.Transaction | null>(null);

	useEffect(() => {
		setIsAndroid(isAndroidBridge());
	}, []);

	// Launch-time seeding into SMS mode needs its dataset: the newest SMS
	// import. Runs once the statement list first loads with content.
	const seedAttempted = useRef(false);
	useEffect(() => {
		if (seedAttempted.current || statements.length === 0) return;
		seedAttempted.current = true;
		const latestSms = statements.find((s) => s.source === "sms");
		if (
			latestSms &&
			isAndroidBridge() &&
			localStorage.getItem(MODE_KEY) !== "statements"
		) {
			loadSmsRecord(latestSms.id);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [statements]);

	// Silent SMS refresh shared by launch, resume and the foreground
	// interval below. Queue-first: messages the catcher queued since the
	// last drain merge append-only (no inbox re-read). Only when the queue
	// is empty AND this install could have missed broadcasts (no seeded SMS
	// record yet, RECEIVE_SMS missing, or no full read in the last day) does
	// it fall back to a full inbox read. The receipt pops solely for
	// user-initiated spends.
	const SMS_SEEDED_KEY = "mpesa-analyzer.sms-seeded";
	const SMS_FULL_READ_KEY = "mpesa-analyzer.sms-full-read";
	const lastSilentRefresh = useRef(0);

	// Merge one batch of messages; resolves true when anything new landed.
	// Shared by the silent paths and the pull-to-refresh gesture.
	function mergeSmsBatch(
		messages: SmsBridgeMessage[],
		bridgeCount: number,
		announce: boolean,
	): Promise<boolean> {
		return new Promise((resolve) => {
			RefreshSmsImport(stampSmsMessages(messages))
				.then((refresh) => {
					const sims = refresh?.sims ?? [];
					const hasNew = sims.some((s) => s.newCount > 0);
					if (!refresh || !hasNew) {
						resolve(false);
						return;
					}
					applySmsRefresh(refresh, bridgeCount, announce);
					// Let payment screens know a real transaction landed, so
					// they can clear the form they just used.
					window.dispatchEvent(new CustomEvent("mpesa:transactions"));
					resolve(true);
				})
				.catch((e) => {
					console.error("Auto SMS import failed:", e);
					resolve(false);
				});
		});
	}

	// One full inbox read: the bridge answers on common:sms (success or
	// error) and this resolves once the merge settles, so the pull
	// indicator can clear. Mirrors startSmsImport's read but stays out of
	// the smsImporting skeleton state, which belongs to the import button.
	function readInbox(announce: boolean): Promise<boolean> {
		return new Promise((resolve) => {
			let settled = false;
			const timer = window.setTimeout(() => finish(false), 20000);
			function finish(value: boolean) {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				resolve(value);
			}
			Events.Once("common:sms", (ev) => {
				const data = ev.data as SmsBridgeResult;
				if (!data?.ok) {
					finish(false);
					return;
				}
				void mergeSmsBatch(
					stampSmsMessages(data.messages ?? []),
					data.count ?? 0,
					announce,
				).then(finish);
			});
			requestSmsImport();
		});
	}

	// Explicit refresh (pull-to-refresh, foreground resume): do the same
	// work as tapping the header's Import SMS button so a pull genuinely
	// re-reads the inbox instead of only draining the catcher queue. The
	// queue merges first (append-only, no permission needed); unless it
	// already delivered the newest message, the whole inbox is re-read and
	// Go drops anything already known. Resolves when settled.
	function refreshSmsNow(): Promise<boolean> {
		if (!isAndroidBridge()) return Promise.resolve(false);
		const perms = smsPermissions();
		if (!perms.read && !perms.receive) return Promise.resolve(false);
		const queued = drainPendingSms();
		const drained =
			queued.length > 0
				? mergeSmsBatch(queued, queued.length, true)
				: Promise.resolve(false);
		// A full inbox read needs READ_SMS; without it the queue drain (when
		// RECEIVE_SMS caught the message) is the whole refresh.
		if (!perms.read) return drained;
		// It was already in notifications: that batch carried the newest
		// message, so skip the re-read. Otherwise - the usual case, since
		// the 5s tick keeps the queue drained - re-read the whole inbox the
		// way the Import SMS button does. Go drops anything already known.
		return drained.then((fromQueue) => (fromQueue ? true : readInbox(true)));
	}

	// Foreground entry for the native side (see WailsBridge.onResume): the
	// one path that does not depend on DOM visibility signals. The ref
	// indirection keeps the global stable while always calling fresh code.
	const foregroundHandler = useRef(() => {});
	foregroundHandler.current = () => {
		refreshPerms();
		void refreshSmsNow();
	};
	useEffect(() => {
		window.__mpesaOnForeground = () => foregroundHandler.current();
		return () => {
			delete window.__mpesaOnForeground;
		};
	}, []);

	function refreshSmsSilently(announce: boolean) {
		if (!isAndroidBridge()) return;
		// Either permission can yield data: RECEIVE_SMS feeds the catcher queue,
		// READ_SMS covers the full-inbox fallback below.
		const perms = smsPermissions();
		if (!perms.read && !perms.receive) return;
		const now = Date.now();
		// Mount and an immediate resume event would otherwise double-fire.
		if (now - lastSilentRefresh.current < 15000) return;
		lastSilentRefresh.current = now;
		const queued = drainPendingSms();
		if (queued.length > 0) {
			void mergeSmsBatch(queued, queued.length, announce);
			return;
		}
		// Everything below re-reads the whole inbox, which needs READ_SMS.
		if (!perms.read) return;
		let seeded = false;
		let lastFullRead = 0;
		try {
			seeded = localStorage.getItem(SMS_SEEDED_KEY) === "1";
			lastFullRead = Number(localStorage.getItem(SMS_FULL_READ_KEY) ?? 0);
		} catch {
			/* ignore */
		}
		// Self-heal: broadcasts missed while the catcher was off (stale
		// install, revoked permission) surface on the next full read, at most
		// once a day.
		if (seeded && perms.receive && now - lastFullRead < 86400000) {
			return;
		}
		try {
			localStorage.setItem(SMS_FULL_READ_KEY, String(now));
		} catch {
			/* ignore */
		}
		Events.Once("common:sms", (ev) => {
			const data = ev.data as SmsBridgeResult;
			if (!data?.ok) return;
			void mergeSmsBatch(stampSmsMessages(data.messages ?? []), data.count ?? 0, announce);
		});
		requestSmsImport();
	}

	// Launch-time refresh. Without permission the app stays put; the manual
	// import buttons remain the only entry.
	useEffect(() => {
		refreshSmsSilently(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Foreground-resume refresh: coming back from a USSD session (or
	// anything else) drains the catcher queue so fresh confirmations merge
	// and receipt-worthy spends pop their slip.
	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === "visible") refreshSmsSilently(true);
		};
		document.addEventListener("visibilitychange", onVisible);
		return () =>
			document.removeEventListener("visibilitychange", onVisible);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Realtime engine: drain the catcher queue every few seconds whether
	// or not the page considers itself visible - visibility signals are
	// unreliable in this WebView, and the drain is a local prefs read that
	// merges only when something actually queued.
	useEffect(() => {
		const tick = () => {
			if (!isAndroidBridge()) return;
			const perms = smsPermissions();
			if (!perms.read && !perms.receive) return;
			const queued = drainPendingSms();
			if (queued.length === 0) return;
			void mergeSmsBatch(queued, queued.length, true);
		};
		tick();
		const timer = window.setInterval(tick, 5000);
		return () => window.clearInterval(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// The current device offset renders received times in the phone's own
	// timezone (JS Date.getTimezoneOffset convention: Nairobi is -180). SIM
	// metadata rides along so Go can keep one record per wallet.
	function stampSmsMessages(messages: SmsBridgeMessage[]) {
		return messages.map((m) => ({
			id: m.id,
			address: m.address,
			dateMs: m.dateMs,
			body: m.body,
			subId: m.subId,
			slot: m.slot,
			simLabel: m.simLabel,
			tzOffsetMinutes: new Date().getTimezoneOffset(),
		}));
	}

	// Apply a refresh across every SIM it touched: upsert each SIM's record
	// meta, then focus a wallet. A receipt-worthy spend wins focus (and pops
	// its slip when announce is set); otherwise stay on the wallet the user is
	// viewing, falling back to whichever SIM gained data.
	function applySmsRefresh(
		refresh: SmsRefreshResult,
		count: number,
		announce: boolean,
	) {
		setSmsResult(refresh.result);
		setSmsBridgeCount(count);
		const sims = refresh.sims ?? [];
		for (const sim of sims) {
			if (sim.record) upsertMeta(sim.record);
		}
		if (sims.length === 0) return;

		const currentId = smsRecordIdRef.current;
		const receiptSim = announce
			? sims.find((s) => s.receipt && (s.newTxns?.length ?? 0) > 0)
			: undefined;
		const focus =
			receiptSim ??
			sims.find((s) => s.record?.id === currentId) ??
			sims.find((s) => s.newCount > 0) ??
			sims[0];
		if (focus?.record) {
			setSmsRecordId(focus.record.id);
			setSmsTxs(focus.record.txs ?? []);
		}
		if (receiptSim) {
			const fresh = receiptSim.newTxns ?? [];
			const newest = fresh[fresh.length - 1];
			if (newest) setReceiptTx(newest);
		}
		// An SMS record exists on this install: future refreshes can trust the
		// catcher queue instead of re-reading the whole inbox.
		try {
			localStorage.setItem(SMS_SEEDED_KEY, "1");
		} catch {
			/* ignore */
		}
	}

	// Debug-only: pop the receipt for the newest loaded SMS transaction,
	// so the arrival UX is testable without moving real money.
	function testArrivalAnnouncement() {
		const newest = smsTxs[smsTxs.length - 1];
		if (!newest) {
			toast.info("No SMS transactions loaded to preview.");
			return;
		}
		setReceiptTx(newest);
	}

	// Manual import from a button: the bridge reads the inbox (asking for
	// SMS access itself when missing), Go merges it into each SIM's record,
	// and this applies it and moves into SMS mode. No modal: pages render
	// skeletons while smsImporting is set.
	function startSmsImport() {
		if (!isAndroidBridge() || smsImportingRef.current) return;
		smsImportingRef.current = true;
		setSmsImporting(true);
		Events.Once("common:sms", (ev) => {
			handleBridgeSms(ev.data as SmsBridgeResult);
		});
		requestSmsImport();
	}

	function handleBridgeSms(data: SmsBridgeResult) {
		if (!data?.ok) {
			smsImportingRef.current = false;
			setSmsImporting(false);
			const err = data?.error ?? "Unknown error";
			if (err.includes("permanently denied")) {
				setGuideOpen(true);
			} else if (err.includes("permission denied")) {
				toast.error("SMS access was denied. Allow it and import again.");
			} else {
				toast.error(`Import failed: ${err}`);
			}
			return;
		}
		RefreshSmsImport(stampSmsMessages(data.messages ?? []))
			.then((res) => {
				smsImportingRef.current = false;
				setSmsImporting(false);
				if (!res) {
					toast.error("Import failed: empty response from the importer.");
					return;
				}
				handleSmsRefresh(res, data.count ?? 0);
			})
			.catch((e) => {
				smsImportingRef.current = false;
				setSmsImporting(false);
				toast.error(`Import failed: ${String(e)}`);
			});
	}

	// Manual import result: the refresh already merged the inbox into each
	// SIM's record, so this applies it and moves into SMS mode.
	function handleSmsRefresh(refresh: SmsRefreshResult, count: number) {
		// Grant state may have just changed behind the permission dialog.
		refreshPerms();
		const sims = refresh.sims ?? [];
		if (sims.length === 0) {
			setSmsResult(refresh.result);
			setSmsBridgeCount(count);
			toast.info(
				count > 0
					? "No M-Pesa transactions were recognized in the inbox."
					: "No M-Pesa messages found in the inbox.",
			);
			return;
		}
		applySmsRefresh(refresh, count, false);
		enterSmsMode();
		const totalNew = sims.reduce((n, s) => n + (s.newCount ?? 0), 0);
		if (totalNew > 0) {
			toast.success(
				`Imported ${totalNew.toLocaleString()} new SMS transaction${totalNew === 1 ? "" : "s"}`,
			);
		} else {
			toast.info("SMS already up to date.");
		}
	}

	function loadSmsRecord(id: string) {
		ActivateStatement(id)
			.then((loaded) => {
				setSmsRecordId(id);
				setSmsTxs(loaded ?? []);
			})
			.catch((e) => console.error("Loading SMS dataset failed:", e));
	}

	// Switch SMS mode to another SIM's wallet.
	function handleSwitchSim(meta: store.StatementMeta) {
		if (meta.id === smsRecordId) return;
		loadSmsRecord(meta.id);
	}

	/** Drop the SMS dataset when its record is deleted elsewhere. */
	function clearSmsRecord(id: string) {
		if (id === smsRecordId) {
			setSmsRecordId(null);
			setSmsTxs([]);
		}
	}

	return {
		smsTxs,
		smsRecordId,
		smsResult,
		smsBridgeCount,
		smsImporting,
		guideOpen,
		setGuideOpen,
		receiptTx,
		setReceiptTx,
		isAndroid,
		startSmsImport,
		refreshSmsNow,
		handleSmsRefresh,
		handleSwitchSim,
		loadSmsRecord,
		clearSmsRecord,
		testArrivalAnnouncement,
	};
}
