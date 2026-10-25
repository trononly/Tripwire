import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
	CATEGORY_ICON_GROUPS,
	CategoryIcon,
	searchCategoryIcons,
	type CategoryIconDef,
} from "@/components/category-icon";

/**
 * The category icon picker: the app's own Lucide icon pack, grouped, with a
 * search that also understands the words people use here ("bangi", "pombe",
 * "matatu", "chama"). Icons only, iOS-style; the title attribute names one on
 * hover and the accessible label names it for a screen reader.
 */
export function IconPicker({
	value,
	onSelect,
}: {
	/** The currently stored icon name. */
	value: string;
	onSelect: (name: string) => void;
}) {
	const [query, setQuery] = useState("");
	const results = useMemo(() => searchCategoryIcons(query), [query]);
	const searching = query.trim() !== "";

	return (
		<div className="overflow-hidden rounded-md border border-border">
			<div className="relative border-b border-border p-2">
				<Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					aria-label="Search icons"
					placeholder="Search icons…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="pl-9"
				/>
			</div>
			<div className="max-h-64 overflow-y-auto p-2">
				{searching ? (
					results.length > 0 ? (
						<IconGrid icons={results} selected={value} onSelect={onSelect} />
					) : (
						<p className="px-1 py-6 text-center text-xs text-muted-foreground">
							No icons match “{query}”.
						</p>
					)
				) : (
					CATEGORY_ICON_GROUPS.map((group) => (
						<div key={group.label} className="mb-3 last:mb-0">
							<p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
								{group.label}
							</p>
							<IconGrid
								icons={group.icons}
								selected={value}
								onSelect={onSelect}
							/>
						</div>
					))
				)}
			</div>
		</div>
	);
}

function IconGrid({
	icons,
	selected,
	onSelect,
}: {
	icons: CategoryIconDef[];
	selected: string;
	onSelect: (name: string) => void;
}) {
	return (
		<div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
			{icons.map((def) => {
				const active = selected === def.name;
				return (
					<button
						key={def.name}
						type="button"
						title={def.name}
						aria-label={def.name}
						aria-pressed={active}
						onClick={() => onSelect(def.name)}
						className={cn(
							"flex aspect-square items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
							active && "bg-accent text-foreground ring-1 ring-primary/50",
						)}
					>
						<CategoryIcon icon={def.name} className="size-5" />
					</button>
				);
			})}
		</div>
	);
}
