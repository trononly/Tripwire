import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type PointerEvent,
} from "react";
import {
	Check,
	GripVertical,
	Pencil,
	Trash2,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { favouriteInitials, moveItem } from "@/lib/favourites";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { cn } from "@/lib/utils";

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

interface DragState {
	id: string;
	index: number;
	target: number;
	startY: number;
	startCenter: number;
	offsetY: number;
	height: number;
	/** Row centres captured when the drag started; transforms must not feed back. */
	centers: number[];
}

/**
 * The saved list shared by the Send and Lipa sheets: rename, remove, and a
 * drag-to-reorder mode. The grip is deliberately a separate hit target with
 * `touch-action: none`, so the sheet still scrolls when the user drags
 * anywhere else. Arrow keys on the grip move an item for keyboard users.
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
	const [drag, setDrag] = useState<DragState | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);

	useEffect(() => {
		setOrder(items);
		setDrag(null);
	}, [items]);

	async function persistOrder(next: FavouritesListItem[]) {
		if (next === order) return;
		setOrder(next);
		setSavingOrder(true);
		const ok = await onReorder(next.map((item) => item.id));
		setSavingOrder(false);
		if (!ok) setOrder(items);
	}

	function startReordering() {
		setOrder(items);
		setReordering(true);
		setEditingId(null);
		setConfirmId(null);
	}

	function stopReordering() {
		setDrag(null);
		setReordering(false);
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

	function startDrag(e: PointerEvent<HTMLButtonElement>, index: number) {
		if (!reordering || savingOrder || e.button !== 0) return;
		const row = e.currentTarget.closest("li");
		if (!row) return;
		const rect = row.getBoundingClientRect();
		if (rect.height <= 0) return;

		e.preventDefault();
		e.currentTarget.focus();
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			/* pointer already gone */
		}

		const centers = Array.from(listRef.current?.children ?? []).map((child) => {
			const box = child.getBoundingClientRect();
			return box.top + box.height / 2;
		});

		setDrag({
			id: order[index].id,
			index,
			target: index,
			startY: e.clientY,
			startCenter: rect.top + rect.height / 2,
			offsetY: 0,
			height: rect.height,
			centers,
		});
		vibrateIfEnabled(8);
	}

	function moveDrag(e: PointerEvent<HTMLButtonElement>) {
		if (!drag) return;
		e.preventDefault();
		const offsetY = e.clientY - drag.startY;
		const center = drag.startCenter + offsetY;

		// Snap to the nearest original row centre. Using captured centres
		// keeps the calculation stable while the other rows are transformed.
		let target = drag.index;
		let nearest = Math.abs((drag.centers[drag.index] ?? center) - center);
		drag.centers.forEach((rowCenter, index) => {
			const distance = Math.abs(rowCenter - center);
			if (distance < nearest) {
				nearest = distance;
				target = index;
			}
		});

		setDrag({ ...drag, offsetY, target });
	}

	function finishDrag(e: PointerEvent<HTMLButtonElement>) {
		if (!drag) return;
		try {
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
		} catch {
			/* pointer already gone */
		}
		const target = drag.target;
		setDrag(null);
		if (target === drag.index) return;
		vibrateIfEnabled(6);
		void persistOrder(moveItem(order, drag.index, target));
	}

	function nudge(index: number, delta: number) {
		if (savingOrder) return;
		const target = index + delta;
		if (target < 0 || target >= order.length) return;
		void persistOrder(moveItem(order, index, target));
	}

	function rowStyle(index: number): CSSProperties | undefined {
		if (!drag) return undefined;
		if (index === drag.index) {
			return {
				transform: `translateY(${drag.offsetY}px)`,
				transition: "none",
				position: "relative",
				zIndex: 20,
			};
		}
		let shift = 0;
		if (drag.target < drag.index && index >= drag.target && index < drag.index) {
			shift = drag.height;
		} else if (
			drag.target > drag.index &&
			index > drag.index &&
			index <= drag.target
		) {
			shift = -drag.height;
		}
		return {
			transform: shift === 0 ? undefined : `translateY(${shift}px)`,
			transition: "transform 160ms ease",
			position: "relative",
		};
	}

	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-baseline gap-2">
					<span className="text-sm font-medium">Saved</span>
					{reordering && order.length > 1 && (
						<span className="text-[11px] text-muted-foreground">
							Drag the grip, or use ↑ ↓
						</span>
					)}
				</div>
				{order.length > 1 && (
					<button
						type="button"
						disabled={drag !== null || savingOrder}
						onClick={() => (reordering ? stopReordering() : startReordering())}
						className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
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
				<ul ref={listRef} className="divide-y rounded-none border">
					{order.map((item, index) => {
						const dragging = drag?.index === index;
						return (
							<li
								key={item.id}
								style={rowStyle(index)}
								className={cn(
									"flex items-center gap-2 px-3 py-1.5",
									reordering && "select-none",
									dragging && "bg-background shadow-lg",
								)}
							>
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
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											aria-label={`Reorder ${item.name}`}
											className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
											disabled={savingOrder}
											onPointerDown={(e) => startDrag(e, index)}
											onPointerMove={moveDrag}
											onPointerUp={finishDrag}
											onPointerCancel={() => setDrag(null)}
											onLostPointerCapture={() => setDrag(null)}
											onKeyDown={(e) => {
												if (e.key === "ArrowUp") {
													e.preventDefault();
													nudge(index, -1);
												}
												if (e.key === "ArrowDown") {
													e.preventDefault();
													nudge(index, 1);
												}
											}}
										>
											<GripVertical className="size-4" aria-hidden />
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
						);
					})}
				</ul>
			)}
		</section>
	);
}

export default FavouritesList;
