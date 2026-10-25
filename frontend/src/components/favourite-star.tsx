import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FavouriteStarProps {
	saved: boolean;
	disabled?: boolean;
	/** Aria label used while the value can still be saved. */
	label: string;
	onClick: () => void;
}

/**
 * Star pinned inside a field, so saving a favourite never shifts the form.
 * It stays mounted in every state; saved renders it filled and inert.
 */
export function FavouriteStar({
	saved,
	disabled,
	label,
	onClick,
}: FavouriteStarProps) {
	return (
		<button
			type="button"
			aria-label={saved ? "Saved to favourites" : label}
			aria-pressed={saved}
			disabled={saved || disabled}
			onClick={onClick}
			className={cn(
				"absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors",
				saved
					? "text-rose-500"
					: "text-muted-foreground hover:text-rose-500 disabled:opacity-40",
			)}
		>
			<Star className={cn("size-5", saved && "fill-current")} aria-hidden />
		</button>
	);
}

export default FavouriteStar;
