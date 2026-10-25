import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
	AddLipaFavourite,
	DeleteLipaFavourite,
	ListLipaFavourites,
	RenameLipaFavourite,
	ReorderLipaFavourites,
} from "../../bindings/mpesa-analyzer/parseservice";
import type { LipaFavourite } from "../../bindings/mpesa-analyzer/internal/store/models";

export type LipaKind = "paybill" | "till";

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

/**
 * Saved Lipa na M-Pesa destinations for one flow: paybills on the Paybill
 * tab, tills on Buy Goods. Manual entry only: unlike Send recipients these
 * never come from the phone's contacts.
 */
export function useLipaFavourites(kind: LipaKind) {
	const [favourites, setFavourites] = useState<LipaFavourite[]>([]);
	const [loading, setLoading] = useState(true);
	const requestId = useRef(0);

	const refresh = useCallback(async () => {
		const id = ++requestId.current;
		try {
			const list = await ListLipaFavourites(kind);
			// Ignore a slow response from the flow the user just left.
			if (id === requestId.current) setFavourites(list ?? []);
		} catch (e) {
			console.error("Loading Lipa favourites failed:", e);
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

	const add = useCallback(
		async (
			name: string,
			kind: LipaKind,
			number: string,
			account: string,
		) => {
			try {
				await AddLipaFavourite(name, kind, number, account);
				await refresh();
				toast.success("Favourite saved.");
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	const rename = useCallback(
		async (id: string, name: string) => {
			try {
				await RenameLipaFavourite(id, name);
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
				await DeleteLipaFavourite(id);
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

	const reorder = useCallback(
		async (ids: string[]) => {
			try {
				await ReorderLipaFavourites(ids);
				await refresh();
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	return {
		favourites,
		loading,
		add,
		rename,
		remove,
		reorder,
		refresh,
	};
}
