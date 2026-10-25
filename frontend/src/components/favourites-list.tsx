import { useEffect, useState } from "react";
import {
	ArrowDown,
	ArrowUp,
	Check,
	Pencil,
	Trash2,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { favouriteInitials, moveItem } from "@/lib/favourites";

export interface FavouritesListItem {
	id: string;
	name: string;
	/** Secondary line, e.g. the saved phone number or paybill account. */
	detail?: string;
}

export interface FavouritesListProps {
	items: FavouritesListItem[];
	loading?: boolean;
	onRename: (id: string, name: string) => Promise<boolean>;
	onRemove: (id: string) => Promise<boolean>;
	onReorder: (ids: string[]) => Promise<boolean>;
}

/**
 * The saved list shared by the Send and Lipa sheets: rename, remove, and a
 * reorder mode with explicit up/down buttons (reliable on a phone, unlike
 * drag-and-drop inside a scrollable drawer).
 */
export function FavouritesList({
	items,
	loading = false,
	onRename,
	onRemove,
	onReorder,
}: FavouritesListProps) {
	const [order, setOrder] = useState(items);
	const [reordering, setReordering] = useState(false);
	const [savingOrder, setSavingOrder] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [removingId, setRemovingId] = useState<string | null>(null);

	useEffect(() => setOrder(items), [items]);

	function startReordering() {
		setOrder(items);
		setReordering(true);
		setEditingId(null);
		setConfirmId(null);
	}

	async function move(index: number, delta: number) {
		const next = moveItem(order, index, index + delta);
		if (next === order) return;
		setOrder(next);
		setSavingOrder(true);
		const ok = await onReorder(next.map((item) => item.id));
		setSavingOrder(false);
		if (!ok) setOrder(items);
	}

	async function saveRename(id: string) {
		const clean = editName.trim();
		if (!clean) return;
		if (await onRename(id, clean)) setEditingId(null);
	}

	async function remove(id: string) {
		setRemovingId(id);
		const ok = await onRemove(id);
		setRemovingId(null);
		if (ok) setConfirmId(null);
	}

	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">Saved</span>
				{order.length > 1 && (
					<button
						type="button"
						onClick={() =>
							reordering ? setReordering(false) : startReordering()
						}
						className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						{reordering ? "Done" : "Reorder"}
					</button>
				)}
			</div>

			{loading ? (
				<p className="rounded-none border p-4 text-center text-xs text-muted-foreground">
					Loading…
				</p>
			) : order.length === 0 ? (
				<p className="rounded-none border border-dashed p-4 text-center text-xs text-muted-foreground">
					No favourites yet
				</p>
			) : (
				<ul className="divide-y rounded-none border">
					{order.map((item, index) => (
						<li key={item.id} className="flex items-center gap-2 px-3 py-1.5">
							<span
								className="flex size-9 shrink-0 items-center justify-center rounded-none bg-neutral-200 text-xs font-normal text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
								aria-hidden
							>
								{favouriteInitials(item.name)}
							</span>

							{reordering ? (
								<>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{item.name}
										</span>
										{item.detail && (
											<span className="block truncate text-[11px] text-muted-foreground">
												{item.detail}
											</span>
										)}
									</span>
									<span className="text-[10px] tabular-nums text-muted-foreground">
										{index + 1}
									</span>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Move ${item.name} up`}
										disabled={index === 0 || savingOrder}
										onClick={() => void move(index, -1)}
									>
										<ArrowUp className="size-4" aria-hidden />
									</Button>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Move ${item.name} down`}
										disabled={index === order.length - 1 || savingOrder}
										onClick={() => void move(index, 1)}
									>
										<ArrowDown className="size-4" aria-hidden />
									</Button>
								</>
							) : editingId === item.id ? (
								<>
									<Input
										aria-label={`Rename ${item.name}`}
										value={editName}
										maxLength={60}
										autoFocus
										onChange={(e) => setEditName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												void saveRename(item.id);
											}
											if (e.key === "Escape") setEditingId(null);
										}}
									/>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label="Save name"
										onClick={() => void saveRename(item.id)}
									>
										<Check className="size-4" aria-hidden />
									</Button>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label="Cancel rename"
										onClick={() => setEditingId(null)}
									>
										<X className="size-4" aria-hidden />
									</Button>
								</>
							) : confirmId === item.id ? (
								<>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{item.name}
										</span>
										<span className="text-[11px] text-muted-foreground">
											Remove this favourite?
										</span>
									</span>
									<Button
										type="button"
										size="xs"
										variant="destructive"
										disabled={removingId === item.id}
										onClick={() => void remove(item.id)}
									>
										Remove
									</Button>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label="Keep favourite"
										onClick={() => setConfirmId(null)}
									>
										<X className="size-4" aria-hidden />
									</Button>
								</>
							) : (
								<>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{item.name}
										</span>
										{item.detail && (
											<span className="block truncate text-[11px] text-muted-foreground">
												{item.detail}
											</span>
										)}
									</span>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Rename ${item.name}`}
										onClick={() => {
											setEditingId(item.id);
											setEditName(item.name);
											setConfirmId(null);
										}}
									>
										<Pencil className="size-4" aria-hidden />
									</Button>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Remove ${item.name}`}
										className="text-muted-foreground hover:text-destructive"
										onClick={() => {
											setConfirmId(item.id);
											setEditingId(null);
										}}
									>
										<Trash2 className="size-4" aria-hidden />
									</Button>
								</>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export default FavouritesList;
