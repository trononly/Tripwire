import type * as categories from "../../bindings/mpesa-analyzer/internal/categories/models";
import { formatMoneyShort } from "./format";

/** The three budget positions the backend reports, plus "none" for a category
 *  the user has not capped. */
export type BudgetState = "none" | "ok" | "near" | "over";

export function budgetStateOf(status: categories.BudgetStatus): BudgetState {
	if (status.budget <= 0) return "none";
	if (status.state === "near" || status.state === "over") return status.state;
	return "ok";
}

/** "2026-07" -> "July 2026"; anything unexpected is shown as it came. */
export function monthLabel(month: string): string {
	if (!/^\d{4}-\d{2}$/.test(month)) return month;
	const [year, rawMonth] = month.split("-").map(Number);
	return new Date(Date.UTC(year, rawMonth - 1, 1)).toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

/** The rounded percentage shown beside a bar. */
export function budgetPercent(status: categories.BudgetStatus): number {
	if (status.budget <= 0) return 0;
	return Math.round(status.percent);
}

/** The part of the track the fill may cover; an overrun stops at 100%. */
export function budgetFillPercent(status: categories.BudgetStatus): number {
	return Math.min(100, Math.max(0, status.percent));
}

/** "KES 1,800 left", "KES 320 over", or "Fully used". */
export function budgetRemainingLabel(status: categories.BudgetStatus): string {
	if (status.budget <= 0) return "";
	if (status.remaining === 0) return "Fully used";
	if (status.remaining < 0) return `${formatMoneyShort(-status.remaining)} over`;
	return `${formatMoneyShort(status.remaining)} left`;
}

/** "KES 4,200 of KES 6,000". */
export function budgetSpentLabel(status: categories.BudgetStatus): string {
	return `${formatMoneyShort(status.spent)} of ${formatMoneyShort(status.budget)}`;
}

/** Colour lives on what is at risk, never on a budget that is fine. */
export function budgetTextClass(state: BudgetState): string {
	if (state === "over") return "text-destructive";
	if (state === "near") return "text-amber-700 dark:text-amber-400";
	return "text-muted-foreground";
}

export function budgetBarClass(state: BudgetState): string {
	if (state === "over") return "bg-destructive";
	if (state === "near") return "bg-amber-500";
	return "bg-foreground/70";
}

export type BudgetSummary = {
	budgeted: categories.BudgetStatus[];
	totalBudget: number;
	totalSpent: number;
	totalRemaining: number;
	percent: number;
	near: categories.BudgetStatus[];
	over: categories.BudgetStatus[];
	/** Worst first: over, then nearest to the cap. */
	atRisk: categories.BudgetStatus[];
	worst: categories.BudgetStatus | null;
};

const severity: Record<BudgetState, number> = {
	none: 0,
	ok: 1,
	near: 2,
	over: 3,
};

/** One aggregate position for the Categories page and the dashboard notice. */
export function summarizeBudgets(
	statuses: categories.BudgetStatus[],
): BudgetSummary {
	const budgeted = statuses.filter((s) => s.budget > 0);
	const totalBudget = budgeted.reduce((sum, s) => sum + s.budget, 0);
	const totalSpent = budgeted.reduce((sum, s) => sum + s.spent, 0);
	const near = budgeted.filter((s) => budgetStateOf(s) === "near");
	const over = budgeted.filter((s) => budgetStateOf(s) === "over");
	const atRisk = [...over, ...near].sort(
		(a, b) =>
			severity[budgetStateOf(b)] - severity[budgetStateOf(a)] ||
			b.percent - a.percent,
	);
	return {
		budgeted,
		totalBudget,
		totalSpent,
		totalRemaining: totalBudget - totalSpent,
		percent: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
		near,
		over,
		atRisk,
		worst: atRisk[0] ?? null,
	};
}

/** A sentence naming the position, used in the notice and in toasts. */
export function describeBudget(status: categories.BudgetStatus): string {
	const name = status.name;
	if (status.state === "over") {
		return `${name} is ${formatMoneyShort(-status.remaining)} over its ${formatMoneyShort(
			status.budget,
		)} budget.`;
	}
	if (status.state === "near" && status.remaining <= 0) {
		return `${name} has reached its ${formatMoneyShort(status.budget)} budget.`;
	}
	if (status.state === "near") {
		return `${name} is at ${budgetPercent(status)}% of its ${formatMoneyShort(
			status.budget,
		)} budget.`;
	}
	if (status.state === "ok") {
		return `${name} has ${formatMoneyShort(status.remaining)} left this month.`;
	}
	return `${name} has no monthly budget.`;
}

/** Short, comma-free phrases for a multi-budget toast. */
export function budgetShortfall(status: categories.BudgetStatus): string {
	if (status.state === "over") {
		return `${status.name} is ${formatMoneyShort(-status.remaining)} over`;
	}
	return `${status.name} is at ${budgetPercent(status)}%`;
}
