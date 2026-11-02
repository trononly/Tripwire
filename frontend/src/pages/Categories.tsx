import { useMemo, useState } from "react";
import { Pencil, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/category-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetProgress } from "@/components/budget-progress";
import { BudgetSummaryCard } from "@/components/budget-summary";
import {
	CategoryEditSheet,
	type CategoryUsage,
} from "@/components/category-edit-sheet";
import { useCategories } from "@/hooks/use-categories";
import { useCategoryBudgets } from "@/hooks/use-category-budgets";
import { useCustomCategoryTotals } from "@/hooks/use-custom-category-totals";
import {
	budgetPercent,
	budgetRemainingLabel,
	budgetSpentLabel,
	budgetStateOf,
	budgetTextClass,
	summarizeBudgets,
} from "@/lib/category-budgets";
import { bumpCategories } from "@/lib/category-refresh";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	DeleteCategory,
	ReorderCategories,
} from "../../bindings/mpesa-analyzer/parseservice";
import type * as categoriesModel from "../../bindings/mpesa-analyzer/internal/categories/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

/**
 * The management page for the user's own categories: create, rename,
 * reorder and delete, plus each category's monthly spending cap. It is a page
 * rather than a sixth bottom-nav tab - Pay stays the centre of the bar - and
 * is reachable from Settings, the desktop sidebar and the dashboard donut.
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

	const { report: budgetReport } = useCategoryBudgets(transactions);
	const budgetById = useMemo(() => {
		const map = new Map<string, categoriesModel.BudgetStatus>();
		for (const status of budgetReport?.statuses ?? []) {
			map.set(status.id, status);
		}
		return map;
	}, [budgetReport]);
	const budgetSummary = useMemo(
		() => summarizeBudgets(budgetReport?.statuses ?? []),
		[budgetReport],
	);

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
		toast.success(`${category.name} deleted`);
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
			<PageHeader
				title="Categories"
				actions={
					<Button
						variant="outline"
						size="sm"
						onClick={() => setEditing({ category: null })}
					>
						<Plus />
						New category
					</Button>
				}
			/>

			{budgetReport && budgetSummary.budgeted.length > 0 ? (
				<BudgetSummaryCard
					summary={budgetSummary}
					month={budgetReport.month}
				/>
			) : null}

			<Card>
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
							<p className="text-sm font-medium">No categories yet</p>
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
									const budget = budgetById.get(category.id);
									const hasBudget = budget !== undefined && budget.budget > 0;
									const state = budget ? budgetStateOf(budget) : "none";
									return (
										<li key={category.id}>
											<button
												type="button"
												onClick={() => setEditing({ category })}
												className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50"
											>
												<span className="flex size-10 shrink-0 items-center justify-center rounded-none bg-muted">
													<CategoryIcon
														icon={category.icon}
														className="size-5"
													/>
												</span>
												<span className="min-w-0 flex-1">
													<span className="flex items-baseline justify-between gap-3">
														<span className="truncate text-sm font-medium">
															{category.name}
														</span>
														{hasBudget && budget ? (
															<span
																className={cn(
																	"shrink-0 text-[13px] tabular-nums",
																	budgetTextClass(state),
																)}
															>
																{budgetRemainingLabel(budget)}
															</span>
														) : usage ? (
															<span className="shrink-0 text-sm tabular-nums text-muted-foreground">
																{formatMoney(usage.amount)}
															</span>
														) : null}
													</span>
													<span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
														{hasBudget && budget
															? budget.count === 0
																? "No spending this month"
																: `${budget.count} ${
																		budget.count === 1
																			? "transaction"
																			: "transactions"
																	} this month`
															: usage
																? `${usage.count} ${
																		usage.count === 1
																			? "transaction"
																			: "transactions"
																	}`
																: "No transactions yet"}
													</span>
													{hasBudget && budget ? (
														<span className="mt-2 block space-y-1">
															<span className="flex items-baseline justify-between gap-3 text-[12px]">
																<span className="truncate tabular-nums text-muted-foreground">
																	{budgetSpentLabel(budget)}
																</span>
																<span
																	className={cn(
																		"shrink-0 tabular-nums",
																		budgetTextClass(state),
																	)}
																>
																	{budgetPercent(budget)}%
																</span>
															</span>
															<BudgetProgress status={budget} />
														</span>
													) : null}
												</span>
												<Pencil className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
				budgetStatus={
					editing?.category ? budgetById.get(editing.category.id) : undefined
				}
				budgetMonth={budgetReport?.month}
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
