import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { typeStyle } from "@/lib/transaction-types";
import { cn } from "@/lib/utils";
import { CATEGORY_EMOJIS } from "@/lib/category-emoji";
import { useCategories } from "@/hooks/use-categories";
import { bumpCategories } from "@/lib/category-refresh";
import {
	AssignCategory,
	CreateCategory,
} from "../../bindings/mpesa-analyzer/parseservice";
import type { TransactionView } from "@/components/transaction-list";

export type CategoryPickerSheetProps = {
	open: boolean;
	/** The transaction being labelled; null before the first open. */
	tx: TransactionView | null;
	/** How many other rows the bulk choice would reach. */
	similarCount: number;
	/** Merchant/person label, or the type label when none exists. */
	similarLabel: string;
	onOpenChange: (open: boolean) => void;
};

/**
 * Label one transaction with a user category. The bulk switch (on by default)
 * extends the choice to every transaction sharing the counterparty, falling
 * back to the transaction type for rows that name none. "Automatic" writes an
 * explicit override for a single row, or clears the shared rule for a group.
 */
export function CategoryPickerSheet({
	open,
	tx,
	similarCount,
	similarLabel,
	onOpenChange,
}: CategoryPickerSheetProps) {
	// Keep the last transaction mounted while the drawer animates out. On the
	// open render `tx` wins immediately (no one-frame flash of the previous
	// row), and after close the saved copy keeps the content stable.
	const [last, setLast] = useState<TransactionView | null>(tx);
	const shown = tx ?? last;
	useEffect(() => {
		if (tx) setLast(tx);
	}, [tx]);

	const { categories, loading, reload } = useCategories();
	const [applySimilar, setApplySimilar] = useState(true);
	const [busy, setBusy] = useState(false);
	const [creating, setCreating] = useState(false);
	const [emoji, setEmoji] = useState("");
	const [name, setName] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setApplySimilar(true);
		setCreating(false);
		setEmoji("");
		setName("");
		setFormError(null);
		void reload();
	}, [open, reload]);

	const bulk = applySimilar && similarCount > 0;

	async function apply(categoryId: string) {
		if (!shown || busy) return;
		setBusy(true);
		try {
			await AssignCategory(
				shown.id,
				shown.type,
				shown.counterpartyKey,
				categoryId,
				bulk,
			);
			bumpCategories();
			onOpenChange(false);
		} catch (e) {
			toast.error(`Could not set the category: ${String(e)}`);
		} finally {
			setBusy(false);
		}
	}

	async function create(e: FormEvent) {
		e.preventDefault();
		if (!shown || busy) return;
		const clean = name.trim();
		if (!emoji.trim() || !clean) {
			setFormError("Pick an emoji and give the category a name.");
			return;
		}
		setFormError(null);
		setBusy(true);
		try {
			const category = await CreateCategory(clean, emoji.trim());
			bumpCategories();
			await reload();
			// Assign in the same gesture: creating a category mid-pick is
			// never a detour. Keep the sheet open if that second step fails.
			await AssignCategory(
				shown.id,
				shown.type,
				shown.counterpartyKey,
				category.id,
				bulk,
			);
			bumpCategories();
			onOpenChange(false);
		} catch (err) {
			toast.error(String(err));
		} finally {
			setBusy(false);
		}
	}

	if (!shown) return null;

	const stamp = typeStyle(shown.type);
	const TypeIcon = stamp.icon;
	const title = shown.counterparty || stamp.label;
	const current = shown.customCategoryId
		? `${shown.customCategoryEmoji} ${shown.customCategoryName}`
		: `Automatic · ${shown.category}`;
	const canCreate = emoji.trim() !== "" && name.trim() !== "" && !busy;

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[90dvh]">
				<DrawerHeader className="text-left">
					<DrawerTitle>Category for {title}</DrawerTitle>
					<p className="text-sm text-muted-foreground">Currently {current}</p>
				</DrawerHeader>

				<div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-2">
					<button
						type="button"
						disabled={busy}
						aria-pressed={!shown.customCategoryId}
						onClick={() => void apply("")}
						className={cn(
							"flex min-h-14 w-full items-center gap-3 rounded-md border p-3 text-left transition-colors disabled:opacity-60",
							!shown.customCategoryId
								? "border-primary bg-accent"
								: "hover:bg-accent/50",
						)}
					>
						<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
							<TypeIcon className="size-4.5" strokeWidth={1.75} />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block text-sm font-medium">Automatic</span>
							<span className="block truncate text-xs text-muted-foreground">
								{shown.category} · the built-in M-Pesa category
							</span>
						</span>
						{!shown.customCategoryId && <Check className="size-4 shrink-0" />}
					</button>

					{loading && categories.length === 0 ? (
						<div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
							<Loader2 className="mr-2 size-4 animate-spin" />
							Loading categories…
						</div>
					) : (
						categories.map((category) => {
							const active = shown.customCategoryId === category.id;
							return (
								<button
									key={category.id}
									type="button"
									disabled={busy}
									aria-pressed={active}
									onClick={() => void apply(category.id)}
									className={cn(
										"flex min-h-14 w-full items-center gap-3 rounded-md border p-3 text-left transition-colors disabled:opacity-60",
										active
											? "border-primary bg-accent"
											: "hover:bg-accent/50",
									)}
								>
									<span
										className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[18px] leading-none"
										aria-hidden
									>
										{category.emoji}
									</span>
									<span className="min-w-0 flex-1 truncate text-sm font-medium">
										{category.name}
									</span>
									{active && <Check className="size-4 shrink-0" />}
								</button>
							);
						})
					)}

					{!creating ? (
						<Button
							type="button"
							variant="ghost"
							className="w-full justify-start gap-2 text-sm"
							onClick={() => {
								setCreating(true);
								setFormError(null);
							}}
						>
							<Plus className="size-4" />
							New category
						</Button>
					) : (
						<form onSubmit={create} className="space-y-2 rounded-md border p-3">
							<div className="flex gap-2">
								<Input
									aria-label="Category emoji"
									value={emoji}
									onChange={(e) => setEmoji(e.target.value)}
									placeholder="🍔"
									maxLength={32}
									className="w-14 shrink-0 text-center text-lg"
								/>
								<Input
									aria-label="Category name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Food & groceries"
									maxLength={40}
								/>
								<Button type="submit" disabled={!canCreate}>
									{busy ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										"Add"
									)}
								</Button>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{CATEGORY_EMOJIS.map((suggestion) => (
									<button
										key={suggestion}
										type="button"
										aria-label={`Use ${suggestion}`}
										onClick={() => setEmoji(suggestion)}
										className={cn(
											"flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent",
											emoji === suggestion && "bg-accent",
										)}
									>
										{suggestion}
									</button>
								))}
							</div>
							{formError && (
								<p className="text-xs text-destructive">{formError}</p>
							)}
						</form>
					)}
				</div>

				{similarCount > 0 && (
					<DrawerFooter className="border-t border-border">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<p className="text-sm font-medium">Apply to similar</p>
								<p className="text-xs text-muted-foreground">
									Also updates {similarCount} other {similarLabel}{" "}
									{similarCount === 1 ? "transaction" : "transactions"}
								</p>
							</div>
							<Button
								type="button"
								size="sm"
								variant={applySimilar ? "default" : "outline"}
								aria-pressed={applySimilar}
								onClick={() => setApplySimilar((v) => !v)}
							>
								{applySimilar ? "On" : "Off"}
							</Button>
						</div>
					</DrawerFooter>
				)}
			</DrawerContent>
		</Drawer>
	);
}
