import { useCallback, useEffect, useState } from "react";
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
 * Saved Lipa na M-Pesa destinations (paybill or till). Manual entry only:
 * unlike Send recipients these never come from the phone's contacts.
 */
export function useLipaFavourites() {
	const [favourites, setFavourites] = useState<LipaFavourite[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const list = await ListLipaFavourites();
			setFavourites(list ?? []);
		} catch (e) {
			console.error("Loading Lipa favourites failed:", e);
		}
	}, []);

	useEffect(() => {
		refresh().finally(() => setLoading(false));
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
