import { TriangleAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	budgetTextClass,
	monthLabel,
	type BudgetSummary,
} from "@/lib/category-budgets";

/**
 * The Categories page's one-glance answer: how much of this month's budgeted
 * money is already spent, and whether any cap needs attention. The per-row
 * figures below carry the detail, so the total is not repeated there.
 */
export function BudgetSummaryCard({
	summary,
	month,
}: {
	summary: BudgetSummary;
	month: string;
}) {
	const riskTone = summary.over.length
		? "over"
		: summary.near.length
			? "near"
			: "ok";
	// The aggregate bar speaks for its own ratio; the sentence beside it
	// names the worst category, so a half-full bar is never painted red
	// because one small category is over.
	const aggregateTone =
		summary.totalSpent > summary.totalBudget
			? "over"
			: summary.percent >= 80
				? "near"
				: "ok";
	const fill = Math.min(100, Math.max(0, summary.percent));
	const count = summary.budgeted.length;
	const barClass =
		aggregateTone === "over"
			? "bg-destructive"
			: aggregateTone === "near"
				? "bg-amber-500"
				: "bg-foreground/70";

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
						className={cn("block h-full", barClass)}
						style={{ width: `${fill}%` }}
					/>
				</span>

				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
					<p className="text-[12px] text-muted-foreground">
						{summary.totalRemaining >= 0
							? `${formatMoneyShort(summary.totalRemaining)} left this month across ${count} ${
									count === 1 ? "category" : "categories"
								}`
							: `${formatMoneyShort(-summary.totalRemaining)} over the plan this month`}
					</p>
					{summary.atRisk.length > 0 ? (
						<p
							className={cn(
								"flex items-center gap-1.5 text-[12px]",
								budgetTextClass(riskTone),
							)}
						>
							<TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
							{summary.over.length > 0
								? summary.near.length > 0
									? `${summary.over.length} over, ${summary.near.length} near the cap`
									: `${summary.over.length} over the cap`
								: `${summary.near.length} near the cap`}
						</p>
					) : (
						<p className="text-[12px] text-muted-foreground">
							All budgets on track
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
