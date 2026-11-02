import { cn } from "@/lib/utils";
import {
	budgetBarClass,
	budgetFillPercent,
	budgetStateOf,
} from "@/lib/category-budgets";
import type * as categories from "../../bindings/mpesa-analyzer/internal/categories/models";

/**
 * A thin spend-against-cap track. The text beside it carries the figures and
 * the percentage, so the bar is decorative and stays hidden from the
 * accessibility tree.
 */
export function BudgetProgress({
	status,
	className,
}: {
	status: categories.BudgetStatus;
	className?: string;
}) {
	const state = budgetStateOf(status);
	return (
		<span
			aria-hidden="true"
			className={cn("block h-1.5 w-full overflow-hidden bg-muted", className)}
		>
			<span
				className={cn("block h-full", budgetBarClass(state))}
				style={{ width: `${budgetFillPercent(status)}%` }}
			/>
		</span>
	);
}
