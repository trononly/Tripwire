import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";

import {
	AddFavourite,
	DeleteFavourite,
	ListFavourites,
	RenameFavourite,
	ReorderFavourites,
} from "../../bindings/mpesa-analyzer/parseservice";
import type { Favourite } from "../../bindings/mpesa-analyzer/internal/store/models";
import {
	canPickContact,
	pickContact,
	type ContactPickResult,
} from "@/lib/sms-bridge";

/** Send Money and Pochi keep separate favourite lists. */
export type SendFavouriteKind = "send" | "pochi";

/** Best-effort message for a rejected Wails call. */
function messageOf(err: unknown): string {
	if (err instanceof Error && err.message.trim()) return err.message;
	if (typeof err === "object" && err !== null && "message" in err) {
		const message = (err as { message?: unknown }).message;
		if (typeof message === "string" && message.trim()) return message;
	}
	const text = String(err ?? "").trim();
	return text && text !== "[object Object]" ? text : "Something went wrong.";
}

function nameOf(data: ContactPickResult): string {
	return (data.name ?? "").trim() || (data.phone ?? "");
}

/**
 * Saved recipients for one Send flow. Storage lives in SQLite behind
 * ParseService; this hook keeps the list in sync and drives the Android
 * contact picker.
 */
export function useFavourites(kind: SendFavouriteKind) {
	const [favourites, setFavourites] = useState<Favourite[]>([]);
	const [loading, setLoading] = useState(true);
	const [picking, setPicking] = useState(false);
	const requestId = useRef(0);

	const refresh = useCallback(async () => {
		const id = ++requestId.current;
		try {
			const list = await ListFavourites(kind);
			// Ignore a slow response from the flow the user just left.
			if (id === requestId.current) setFavourites(list ?? []);
		} catch (e) {
			console.error("Loading favourites failed:", e);
		}
	}, [kind]);

	useEffect(() => {
		setFavourites([]);
		setLoading(true);
		let current = true;
		refresh().finally(() => {
			if (current) setLoading(false);
		});
		return () => {
			current = false;
		};
	}, [refresh]);

	// Register before opening the picker: the result arrives as an event.
	useEffect(() => {
		if (!picking) return;
		const off = Events.Once("common:contact", (ev) => {
			setPicking(false);
			const data = (ev.data ?? {}) as ContactPickResult;
			if (data.cancelled) return;
			if (!data.ok || !data.phone) {
				toast.error(data.error || "Could not read that contact.");
				return;
			}
			AddFavourite(data.name ?? "", data.phone, kind)
				.then(async () => {
					await refresh();
					toast.success(`${nameOf(data)} saved.`);
				})
				.catch((e) => toast.error(messageOf(e)));
		});
		pickContact();
		return off;
	}, [picking, refresh, kind]);

	const add = useCallback(
		async (name: string, phone: string) => {
			try {
				await AddFavourite(name, phone, kind);
				await refresh();
				toast.success("Favourite saved.");
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh, kind],
	);

	const rename = useCallback(
		async (id: string, name: string) => {
			try {
				await RenameFavourite(id, name);
				await refresh();
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			try {
				await DeleteFavourite(id);
				await refresh();
				toast.success("Favourite removed.");
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	/** Persist the full list in display order. */
	const reorder = useCallback(
		async (ids: string[]) => {
			try {
				await ReorderFavourites(ids);
				await refresh();
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	/** Open the system picker on Android; desktop gets a manual-entry hint. */
	const pickFromContacts = useCallback(() => {
		if (!canPickContact()) {
			toast.info("Picking a contact needs the Android app. Add the number manually.");
			return;
		}
		setPicking(true);
	}, []);

	return {
		favourites,
		loading,
		picking,
		canPick: canPickContact(),
		add,
		rename,
		remove,
		reorder,
		pickFromContacts,
		refresh,
	};
}
