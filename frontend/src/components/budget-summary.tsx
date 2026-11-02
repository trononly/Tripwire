import { Card, CardContent } from "@/components/ui/card";
import { formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthLabel, type BudgetSummary } from "@/lib/category-budgets";

/**
 * The Categories page's one-glance figure: how much of this month's budgeted
 * money is already spent. The rows below carry the per-category detail and the
 * warnings, so the summary stops at the total and its bar rather than
 * repeating the same sentences.
 */
export function BudgetSummaryCard({
	summary,
	month,
}: {
	summary: BudgetSummary;
	month: string;
}) {
	const over = summary.totalSpent > summary.totalBudget;
	const fill = Math.min(100, Math.max(0, summary.percent));

	return (
		<Card>
			<CardContent className="space-y-3 p-4">
				<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<div className="flex min-w-0 items-baseline gap-2">
						<h2 className="text-[15px] font-semibold tracking-tight">
							Monthly budgets
						</h2>
						<span className="truncate text-[12px] text-muted-foreground">
							{monthLabel(month)}
						</span>
					</div>
					<p className="num shrink-0 text-sm tabular-nums">
						<span className="font-semibold">
							{formatMoneyShort(summary.totalSpent)}
						</span>
						<span className="text-muted-foreground">
							{" "}
							of {formatMoneyShort(summary.totalBudget)}
						</span>
					</p>
				</div>

				<span
					aria-hidden="true"
					className="block h-2 w-full overflow-hidden bg-muted"
				>
					<span
						className={cn(
							"block h-full",
							over ? "bg-destructive" : "bg-foreground/70",
						)}
						style={{ width: `${fill}%` }}
					/>
				</span>
			</CardContent>
		</Card>
	);
}
