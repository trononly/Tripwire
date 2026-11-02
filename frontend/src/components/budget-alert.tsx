import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeBudget, type BudgetSummary } from "@/lib/category-budgets";

/**
 * The dashboard's budget warning. It only appears when a cap is close or
 * already passed, so a healthy month stays quiet. The sentence names the
 * category and the real figures; the button is the way to the page that can
 * change them.
 */
export function BudgetAlert({
	summary,
	onReview,
}: {
	summary: BudgetSummary;
	onReview: () => void;
}) {
	if (!summary.worst) return null;

	const over = summary.over.length;
	const near = summary.near.length;
	const tone = over > 0 ? "over" : "near";
	const headline =
		over > 0
			? over === 1
				? "1 budget is over"
				: `${over} budgets are over`
			: near === 1
				? "1 budget is close to its cap"
				: `${near} budgets are close to their cap`;

	const named = summary.atRisk.slice(0, 2).map(describeBudget).join(" ");
	const rest = summary.atRisk.length - 2;
	const detail = rest > 0 ? `${named} And ${rest} more.` : named;

	return (
		<div
			role="alert"
			className={cn(
				"flex flex-col gap-3 border p-4 sm:flex-row sm:items-start",
				tone === "over"
					? "border-destructive/40 bg-destructive/5"
					: "border-amber-500/40 bg-amber-500/10",
			)}
		>
			<div className="flex min-w-0 flex-1 items-start gap-2.5">
				<TriangleAlert
					aria-hidden="true"
					className={cn(
						"mt-0.5 size-4 shrink-0",
						tone === "over"
							? "text-destructive"
							: "text-amber-600 dark:text-amber-400",
					)}
				/>
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-medium">{headline}</p>
					<p className="text-[13px] leading-relaxed text-muted-foreground">
						{detail}
					</p>
				</div>
			</div>
			<Button
				variant="outline"
				size="sm"
				className="shrink-0 self-start"
				onClick={onReview}
			>
				Review budgets
			</Button>
		</div>
	);
}
