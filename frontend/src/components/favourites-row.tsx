import { Plus, Star } from "lucide-react";

import { favouriteInitials } from "@/lib/favourites";
import { cn } from "@/lib/utils";

export interface FavouriteChip {
	id: string;
	name: string;
	active?: boolean;
	onPick: () => void;
}

export interface FavouritesRowProps {
	items: FavouriteChip[];
	onManage: () => void;
	emptyTitle?: string;
	emptyHint?: string;
	/** Chip label cap; the management sheet shows the full name. */
	max?: number;
}

/**
 * Quick-pick shortcuts above the form. Tapping a tile only fills the fields -
 * sending stays an explicit second tap. The add tile comes first so the row
 * reads "add, then saved people"; tiles are square and borderless to match
 * the rest of the app.
 */
export function FavouritesRow({
	items,
	onManage,
	emptyTitle = "Save your regulars",
	emptyHint = "Add a contact or number for one-tap sending",
	max = 8,
}: FavouritesRowProps) {
	const shown = items.slice(0, max);

	return (
		<div className="space-y-2">
			<span className="flex items-center gap-1.5 text-sm font-medium">
				<Star className="size-3.5 text-rose-500" aria-hidden />
				Favourites
			</span>

			{items.length === 0 ? (
				<button
					type="button"
					onClick={onManage}
					className="flex w-full items-center gap-3 rounded-none border border-dashed border-border px-3 py-2 text-left transition-colors hover:border-rose-500/40 hover:bg-rose-500/5"
				>
					<span className="flex size-9 shrink-0 items-center justify-center rounded-none bg-muted">
						<Plus className="size-4 text-muted-foreground" aria-hidden />
					</span>
					<span className="min-w-0">
						<span className="block text-xs font-medium text-foreground">
							{emptyTitle}
						</span>
						<span className="block truncate text-[11px] text-muted-foreground">
							{emptyHint}
						</span>
					</span>
				</button>
			) : (
				<div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<button
						type="button"
						onClick={onManage}
						aria-label="Add favourite"
						className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-none p-1 text-center transition-colors hover:bg-muted/60"
					>
						<span className="flex size-11 items-center justify-center rounded-none bg-neutral-200 dark:bg-neutral-800">
							<Plus
								className="size-4 text-neutral-600 dark:text-neutral-400"
								aria-hidden
							/>
						</span>
						<span className="w-full truncate text-xs font-medium leading-tight text-muted-foreground">
							Add
						</span>
					</button>

					{shown.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={item.onPick}
							aria-pressed={item.active}
							className={cn(
								"flex w-20 shrink-0 flex-col items-center gap-1 rounded-none p-1 text-center transition-colors",
								item.active ? "bg-muted" : "hover:bg-muted/60",
							)}
						>
							<span
								className="flex size-11 items-center justify-center rounded-none bg-neutral-200 text-xs font-normal text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
								aria-hidden
							>
								{favouriteInitials(item.name)}
							</span>
							<span className="w-full truncate text-xs font-medium leading-tight text-foreground">
								{item.name}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export default FavouritesRow;
