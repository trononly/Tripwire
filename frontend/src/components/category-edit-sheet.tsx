import { useEffect, useState, type FormEvent } from "react";
import {
	ArrowDown,
	ArrowUp,
	Loader2,
	Trash2,
} from "lucide-react";

import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { CATEGORY_EMOJIS } from "@/lib/category-emoji";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { cn } from "@/lib/utils";
import { bumpCategories } from "@/lib/category-refresh";
import {
	CreateCategory,
	UpdateCategory,
} from "../../bindings/mpesa-analyzer/parseservice";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

export type CategoryUsage = { count: number; amount: number };

export type CategoryEditSheetProps = {
	open: boolean;
	/** The category being edited, or null to create a new one. */
	category: store.Category | null;
	/** Transactions labelled with it in the active dataset. */
	usage?: CategoryUsage;
	/** Position in the list, for the move buttons; both zero when new. */
	index: number;
	total: number;
	onOpenChange: (open: boolean) => void;
	/** Re-read the list after a save or a move. */
	onChanged: () => Promise<void> | void;
	move: (category: store.Category, direction: -1 | 1) => Promise<void>;
	/** Delete for real; reject to surface the error in the sheet. */
	onDelete: (category: store.Category) => Promise<void>;
};

/**
 * Create or edit one user category: emoji, name, order and deletion. The
 * picker's inline create is deliberately narrower - this is the full form
 * behind the Categories page, where renaming and reordering live.
 */
export function CategoryEditSheet({
	open,
	category,
	usage,
	index,
	total,
	onOpenChange,
	onChanged,
	move,
	onDelete,
}: CategoryEditSheetProps) {
	const [emoji, setEmoji] = useState("");
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		if (!open) return;
		setEmoji(category?.emoji ?? "");
		setName(category?.name ?? "");
		setError(null);
		setBusy(false);
		setConfirmDelete(false);
	}, [open, category]);

	const canSave = emoji.trim() !== "" && name.trim() !== "" && !busy;

	async function save(e: FormEvent) {
		e.preventDefault();
		if (!canSave) return;
		setBusy(true);
		setError(null);
		try {
			if (category) {
				await UpdateCategory(category.id, name.trim(), emoji.trim());
			} else {
				await CreateCategory(name.trim(), emoji.trim());
			}
			bumpCategories();
			vibrateIfEnabled(10);
			await onChanged();
			onOpenChange(false);
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	}

	async function shift(direction: -1 | 1) {
		if (!category || busy) return;
		setBusy(true);
		setError(null);
		try {
			await move(category, direction);
			vibrateIfEnabled(8);
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	}

	async function remove() {
		if (!category || busy) return;
		setBusy(true);
		setError(null);
		try {
			await onDelete(category);
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[90dvh]">
				<DrawerHeader className="text-left">
					<DrawerTitle>
						{category ? "Edit category" : "New category"}
					</DrawerTitle>
					<DrawerDescription>
						{usage && usage.count > 0
							? `${usage.count} ${
									usage.count === 1 ? "transaction" : "transactions"
								} · ${formatMoney(usage.amount)} in this dataset`
							: "Labels follow the transaction, not the import."}
					</DrawerDescription>
				</DrawerHeader>

				<form onSubmit={save} className="space-y-3 overflow-y-auto px-4 pb-2">
					<div className="flex gap-2">
						<Input
							aria-label="Category emoji"
							value={emoji}
							onChange={(e) => setEmoji(e.target.value)}
							placeholder="🍔"
							maxLength={32}
							className="w-16 shrink-0 text-center text-lg"
						/>
						<Input
							aria-label="Category name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Food & groceries"
							maxLength={40}
						/>
					</div>

					<div className="flex flex-wrap gap-1.5">
						{CATEGORY_EMOJIS.map((suggestion) => (
							<button
								key={suggestion}
								type="button"
								aria-label={`Use ${suggestion}`}
								aria-pressed={emoji === suggestion}
								onClick={() => setEmoji(suggestion)}
								className={cn(
									"flex size-9 items-center justify-center rounded-md text-lg hover:bg-accent",
									emoji === suggestion && "bg-accent",
								)}
							>
								{suggestion}
							</button>
						))}
					</div>

					{error && <p className="text-xs text-destructive">{error}</p>}

					<Button type="submit" className="w-full" disabled={!canSave}>
						{busy ? (
							<Loader2 className="size-4 animate-spin" />
						) : category ? (
							"Save changes"
						) : (
							"Create category"
						)}
					</Button>
				</form>

				{category && (
					<DrawerFooter className="border-t border-border">
						{confirmDelete ? (
							<div className="space-y-2">
								<p className="text-sm font-medium">
									Delete “{category.emoji} {category.name}”?
								</p>
								<p className="text-xs text-muted-foreground">
									{usage && usage.count > 0
										? `Its ${usage.count} labelled ${
												usage.count === 1
													? "transaction goes"
													: "transactions go"
											} back to the M-Pesa category. This cannot be undone.`
										: "This cannot be undone."}
								</p>
								{error && <p className="text-xs text-destructive">{error}</p>}
								<div className="grid grid-cols-2 gap-2">
									<Button
										type="button"
										variant="outline"
										disabled={busy}
										onClick={() => {
											setConfirmDelete(false);
											setError(null);
										}}
									>
										Cancel
									</Button>
									<Button
										type="button"
										variant="destructive"
										disabled={busy}
										onClick={() => void remove()}
									>
										{busy ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											"Delete"
										)}
									</Button>
								</div>
							</div>
						) : (
							<>
								<div className="grid grid-cols-2 gap-2">
									<Button
										type="button"
										variant="outline"
										disabled={busy || index <= 0}
										onClick={() => void shift(-1)}
									>
										<ArrowUp className="size-4" />
										Move up
									</Button>
									<Button
										type="button"
										variant="outline"
										disabled={busy || index >= total - 1}
										onClick={() => void shift(1)}
									>
										<ArrowDown className="size-4" />
										Move down
									</Button>
								</div>
								<Button
									type="button"
									variant="ghost"
									className="w-full text-destructive hover:text-destructive"
									onClick={() => setConfirmDelete(true)}
								>
									<Trash2 className="size-4" />
									Delete category
								</Button>
							</>
						)}
					</DrawerFooter>
				)}
			</DrawerContent>
		</Drawer>
	);
}
