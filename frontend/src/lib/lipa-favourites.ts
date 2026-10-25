import type { LipaFavourite } from "../../bindings/mpesa-analyzer/internal/store/models";

export type { LipaFavourite };

export type LipaKind = "paybill" | "till";

export function lipaKindLabel(kind: string): string {
	return kind === "till" ? "Till" : "Paybill";
}

/** "Paybill 888880 · 12345678" / "Till 543210" for the sheet list. */
export function lipaFavouriteDetail(fav: LipaFavourite): string {
	const kind = lipaKindLabel(fav.kind);
	return fav.account ? `${kind} ${fav.number} · ${fav.account}` : `${kind} ${fav.number}`;
}

function digits(value: string): string {
	return value.replace(/\D/g, "");
}

/** True when the form already holds this saved paybill/till. */
export function isActiveLipaFavourite(
	fav: LipaFavourite,
	kind: LipaKind,
	number: string,
	account: string,
): boolean {
	if (fav.kind !== kind || digits(fav.number) !== digits(number)) return false;
	if (kind === "till") return true;
	return (
		fav.account.trim().toLowerCase() === account.trim().toLowerCase()
	);
}
