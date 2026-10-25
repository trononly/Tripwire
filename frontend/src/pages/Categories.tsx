import { useMemo, useState } from "react";
import { Pencil, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	CategoryEditSheet,
	type CategoryUsage,
} from "@/components/category-edit-sheet";
import { useCategories } from "@/hooks/use-categories";
import { useCustomCategoryTotals } from "@/hooks/use-custom-category-totals";
import { bumpCategories } from "@/lib/category-refresh";
import { formatMoney } from "@/lib/format";
import {
	DeleteCategory,
	ReorderCategories,
} from "../../bindings/mpesa-analyzer/parseservice";
import type * as categoriesModel from "../../bindings/mpesa-analyzer/internal/categories/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

/**
 * The management page for the user's own categories: create, rename,
 * reorder and delete. It is a page rather than a sixth bottom-nav tab - Pay
 * stays the centre of the bar - and is reachable from Settings, the desktop
 * sidebar and the dashboard donut.
 */
export default function Categories({
	transactions,
}: {
	/** The active dataset, used for each category's usage line. */
	transactions: parser.Transaction[];
}) {
	const { categories, loading, error, reload } = useCategories();
	const { totals } = useCustomCategoryTotals(transactions, true);
	const usageById = useMemo(() => {
		const map = new Map<string, categoriesModel.Total>();
		for (const total of totals) {
			if (total.id) map.set(total.id, total);
		}
		return map;
	}, [totals]);

	// null closes the sheet; a null category means "create".
	const [editing, setEditing] = useState<{ category: store.Category | null } | null>(
		null,
	);

	async function move(category: store.Category, direction: -1 | 1) {
		const ids = categories.map((c) => c.id);
		const from = ids.indexOf(category.id);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to], ids[from]];
		try {
			await ReorderCategories(ids);
			bumpCategories();
			await reload();
		} catch (e) {
			toast.error(`Could not reorder: ${String(e)}`);
		}
	}

	// The edit sheet owns the confirmation; a rejection keeps it open with
	// the error, so a failed delete never looks like it worked.
	async function deleteCategory(category: store.Category) {
		await DeleteCategory(category.id);
		bumpCategories();
		await reload();
		toast.success(`${category.emoji} ${category.name} deleted`);
		setEditing(null);
	}

	const editingIndex = editing?.category
		? categories.findIndex((c) => c.id === editing.category?.id)
		: -1;
	const editingUsage: CategoryUsage | undefined = editing?.category
		? usageById.get(editing.category.id)
		: undefined;

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h1 className="text-xl font-semibold tracking-tight">Categories</h1>
				<p className="text-sm text-muted-foreground">
					Your own labels sit on top of the M-Pesa categories. They follow
					the transaction, so re-importing a statement or refreshing your SMS
					wallet keeps them.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Your categories</CardTitle>
					<CardDescription>
						Tap a category to rename it, move it, or delete it. Counts
						cover the dataset you are viewing.
					</CardDescription>
				</CardHeader>
				<CardContent className="p-0">
					{loading && categories.length === 0 ? (
						<div className="space-y-2 p-4">
							{Array.from({ length: 3 }).map((_, i) => (
								<Skeleton key={i} className="h-14" />
							))}
						</div>
					) : error ? (
						<p className="p-4 text-sm text-destructive">{error}</p>
					) : categories.length === 0 ? (
						<div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
							<Tags className="size-6 text-muted-foreground" />
							<div className="space-y-1">
								<p className="text-sm font-medium">No categories yet</p>
								<p className="text-xs text-muted-foreground">
									Create one here, or tap a transaction's icon in
									Transactions.
								</p>
							</div>
							<Button onClick={() => setEditing({ category: null })}>
								<Plus />
								New category
							</Button>
						</div>
					) : (
						<>
							<ul className="divide-y divide-border">
								{categories.map((category) => {
									const usage = usageById.get(category.id);
									return (
										<li key={category.id}>
											<button
												type="button"
												onClick={() => setEditing({ category })}
												className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/50"
											>
												<span
													className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl leading-none"
													aria-hidden
												>
													{category.emoji}
												</span>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-medium">
														{category.name}
													</span>
													<span className="block truncate text-xs text-muted-foreground">
														{usage
															? `${usage.count} ${
																	usage.count === 1
																		? "transaction"
																		: "transactions"
																} · ${formatMoney(usage.amount)}`
															: "No transactions yet"}
													</span>
												</span>
												<Pencil className="size-4 shrink-0 text-muted-foreground" />
											</button>
										</li>
									);
								})}
							</ul>
							<div className="border-t border-border p-4">
								<Button
									variant="outline"
									className="w-full"
									onClick={() => setEditing({ category: null })}
								>
									<Plus />
									New category
								</Button>
							</div>
						</>
					)}
				</CardContent>
			</Card>

			<CategoryEditSheet
				open={editing !== null}
				category={editing?.category ?? null}
				usage={editingUsage}
				index={editingIndex}
				total={categories.length}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onChanged={reload}
				move={move}
				onDelete={deleteCategory}
			/>
		</div>
	);
}
