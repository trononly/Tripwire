import { Plus, Settings2, Star } from "lucide-react";

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
 * Quick-pick chips above the form. Tapping one only fills the fields -
 * sending stays an explicit second tap.
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
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 text-sm font-medium">
					<Star className="size-3.5 text-rose-500" aria-hidden />
					Favourites
				</span>
				<button
					type="button"
					onClick={onManage}
					className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<Settings2 className="size-3.5" aria-hidden />
					Manage
				</button>
			</div>

			{items.length === 0 ? (
				<button
					type="button"
					onClick={onManage}
					className="flex w-full items-center gap-2.5 rounded-md border border-dashed border-border px-3 py-2 text-left transition-colors hover:border-rose-500/40 hover:bg-rose-500/5"
				>
					<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
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
				<div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{shown.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={item.onPick}
							aria-pressed={item.active}
							className={cn(
								"flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-left transition-colors",
								item.active
									? "border-rose-500/60 bg-rose-500/10"
									: "border-border bg-background hover:border-rose-500/30 hover:bg-muted",
							)}
						>
							<span
								className={cn(
									"flex size-7 items-center justify-center rounded-full text-[10px] font-semibold",
									item.active
										? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
										: "bg-muted text-muted-foreground",
								)}
								aria-hidden
							>
								{favouriteInitials(item.name)}
							</span>
							<span className="max-w-[8rem] truncate text-xs font-medium">
								{item.name}
							</span>
						</button>
					))}
					<button
						type="button"
						onClick={onManage}
						aria-label="Manage favourites"
						className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-rose-500/40 hover:text-foreground"
					>
						<Plus className="size-4" aria-hidden />
					</button>
				</div>
			)}
		</div>
	);
}

export default FavouritesRow;
