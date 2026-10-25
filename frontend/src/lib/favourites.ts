import type { Favourite } from "../../bindings/mpesa-analyzer/internal/store/models";
import { normalizePhone } from "@/lib/ussd-menus";

export type { Favourite };

/** "0712 345 678" for a canonical local number; anything else as typed. */
export function formatFavouritePhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.length === 10 && digits.startsWith("0")) {
		return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
	}
	return phone;
}

/**
 * Up to two letters for the avatar: one per word ("Mama Jane" → "MJ").
 * Names that are just the saved number fall back to its last two digits.
 */
export function favouriteInitials(name: string): string {
	const letters = name
		.trim()
		.split(/\s+/)
		.map((word) => Array.from(word).find((ch) => /\p{L}/u.test(ch)))
		.filter((ch): ch is string => Boolean(ch))
		.join("");
	if (letters) return letters.slice(0, 2).toUpperCase();

	const digits = name.replace(/\D/g, "");
	if (digits) return digits.slice(-2);
	return "#";
}

/** True when this favourite is the number currently in the Send form. */
export function isActiveFavourite(fav: Favourite, phone: string): boolean {
	const current = normalizePhone(phone);
	return current !== "" && normalizePhone(fav.phone) === current;
}

/** Move one item to another index, returning a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
	if (
		from === to ||
		from < 0 ||
		to < 0 ||
		from >= items.length ||
		to >= items.length
	) {
		return items;
	}
	const next = items.slice();
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}
