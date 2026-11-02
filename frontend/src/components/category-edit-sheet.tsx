import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";

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
import { resolveCategoryIcon } from "@/components/category-icon";
import { CategoryIconField } from "@/components/category-icon-field";
import { cn } from "@/lib/utils";
import { formatAmountInput, formatMoney } from "@/lib/format";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { bumpCategories } from "@/lib/category-refresh";
import {
	CreateCategory,
	SetCategoryBudget,
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
 * Create or edit one user category: icon, name, monthly budget, the percentage
 * where its warning starts, order and deletion. The picker's inline create is
 * deliberately narrower - this is the full form behind the Categories page,
 * where renaming, budgeting and reordering live.
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
	const [icon, setIcon] = useState("tag");
	const [name, setName] = useState("");
	const [budget, setBudget] = useState("");
	const [warn, setWarn] = useState("80");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		if (!open) return;
		setIcon(resolveCategoryIcon(category?.icon ?? "tag"));
		setName(category?.name ?? "");
		setBudget(category?.budget ? String(category.budget / 100) : "");
		setWarn(
			category?.warnPercent ? String(category.warnPercent) : "80",
		);
		setError(null);
		setBusy(false);
		setConfirmDelete(false);
	}, [open, category]);

	const budgetShillings = Number(budget || 0);
	const budgetFinite = Number.isFinite(budgetShillings);
	const budgetTooSmall = budget !== "" && (!budgetFinite || budgetShillings < 1);
	const budgetTooLarge = budgetFinite && budgetShillings > 10_000_000;
	const budgetValid = budgetFinite && !budgetTooSmall && !budgetTooLarge;
	const budgetCents =
		budgetValid && budget !== "" ? Math.round(budgetShillings * 100) : 0;

	const warnPercent = Number(warn || 0);
	const warnValid =
		Number.isInteger(warnPercent) &&
		warnPercent >= 1 &&
		warnPercent <= 100;
	// With no cap the warning field is hidden; a leftover invalid value must
	// not block the save. Keep a valid choice for when a cap is set again.
	const storedWarn = warnValid ? warnPercent : 80;

	const canSave =
		icon.trim() !== "" &&
		name.trim() !== "" &&
		budgetValid &&
		(budgetCents === 0 || warnValid) &&
		!busy;

	async function save(e: FormEvent) {
		e.preventDefault();
		if (!canSave) return;
		setBusy(true);
		setError(null);
		try {
			if (category) {
				await UpdateCategory(category.id, name.trim(), icon.trim());
				await SetCategoryBudget(category.id, budgetCents, storedWarn);
			} else {
				const created = await CreateCategory(name.trim(), icon.trim());
				await SetCategoryBudget(created.id, budgetCents, storedWarn);
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
					{usage && usage.count > 0 ? (
						<DrawerDescription>
							{`${usage.count} ${
								usage.count === 1 ? "transaction" : "transactions"
							} · ${formatMoney(usage.amount)}`}
						</DrawerDescription>
					) : null}
				</DrawerHeader>

				<form onSubmit={save} className="space-y-3 overflow-y-auto px-4 pb-2">
					<div className="flex items-center gap-2">
						<CategoryIconField value={icon} onChange={setIcon} />
						<Input
							aria-label="Category name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Food & groceries"
							maxLength={40}
						/>
					</div>

					<div className="space-y-1.5 pt-1">
						<div className="flex items-baseline justify-between gap-3">
							<label
								htmlFor="category-budget"
								className="text-[13px] font-medium text-foreground"
							>
								Monthly budget
							</label>
							{budget !== "" ? (
								<button
									type="button"
									onClick={() => setBudget("")}
									className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
								>
									Clear
								</button>
							) : null}
						</div>
						<div
							className={cn(
								"flex h-10 items-center gap-2 border border-input bg-muted/30 px-3 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
								!budgetValid && "border-destructive",
							)}
						>
							<span className="text-xs font-medium text-muted-foreground">
								KES
							</span>
							<input
								id="category-budget"
								inputMode="numeric"
								autoComplete="off"
								maxLength={12}
								placeholder="No budget"
								value={formatAmountInput(budget)}
								onChange={(e) =>
									setBudget(e.target.value.replace(/\D/g, ""))
								}
								aria-invalid={!budgetValid}
								aria-describedby="category-budget-help"
								className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground/60"
							/>
							<span className="shrink-0 text-[12px] text-muted-foreground">
								/ month
							</span>
						</div>
						<p
							id="category-budget-help"
							className="text-[12px] leading-relaxed text-muted-foreground"
						>
							{budgetTooSmall
								? "Enter at least KES 1, or leave it empty."
								: budgetTooLarge
									? "The most you can set is KES 10,000,000."
									: "Leave empty for no budget."}
						</p>

						{budgetCents > 0 ? (
							<div className="space-y-1.5 pt-1">
								<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
									<label
										htmlFor="category-warn"
										className="text-[13px] font-medium text-foreground"
									>
										Warn me at
									</label>
									<div
										className={cn(
											"flex h-9 items-center gap-1.5 border border-input bg-muted/30 px-2.5",
											!warnValid && "border-destructive",
										)}
									>
										<input
											id="category-warn"
											type="text"
											inputMode="numeric"
											autoComplete="off"
											maxLength={3}
											value={warn}
											onChange={(e) =>
												setWarn(
													e.target.value
														.replace(/\D/g, "")
														.slice(0, 3),
												)
											}
											aria-invalid={!warnValid}
											className="w-8 bg-transparent text-right text-sm tabular-nums outline-none"
										/>
										<span className="text-[12px] text-muted-foreground">
											% of budget
										</span>
									</div>
								</div>
								{!warnValid ? (
									<p className="text-[12px] text-destructive">
										Choose 1 to 100.
									</p>
								) : null}
							</div>
						) : null}
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
									Delete “{category.name}”?
								</p>
								<p className="text-xs text-muted-foreground">
									{usage && usage.count > 0
										? `Its ${usage.count} labelled ${
												usage.count === 1
													? "transaction goes"
													: "transactions go"
											} back to the standard category. This cannot be undone.`
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
